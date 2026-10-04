import { resolve } from "node:path";
import type { EvalRun, ExecutionObserver } from "../types";
import { Results } from "../infra/sqlite";
import { runtimeFingerprint } from "../infra/containers/oci";
import { runEvalPipeline } from "./run-eval-pipeline";
import { ExecutionBudget } from "./execution-budget";
import { executeQueue, finishBenchmark } from "./run-benchmark";
import { recoverStoppedRunner, runnerStopped } from "./recover-run";
import { retryPlan } from "./plan-retries";
import { CostBudget, estimateWork } from "./cost-plan";

export async function retryEvalRun(
  directory: string,
  evalRunId: string,
  onEvent?: ExecutionObserver,
) {
  return (await retryEvalRuns(directory, [evalRunId], onEvent))[0]!;
}

/** Read-only preflight for a precise retry scope. No model calls or selection updates. */
export async function planEvalRunRetries(directory: string, evalRunIds: readonly string[]) {
  using results = new Results(resolve(directory, "runner.db"), true);
  const benchmark = results.benchmark!;
  if (benchmark.mergedInto || benchmark.state === "running")
    throw new Error("Wait for active work and select the aggregate run");
  const runtime = await runtimeFingerprint(benchmark.definition.container, benchmark.definition.judge.verification);
  const plan = retryPlan(benchmark.definition, runtime, results, evalRunIds);
  return { plan, estimate: estimateWork(benchmark.definition, results, plan) };
}

/** A single retry round; original evidence and judgments remain immutable. */
export async function retryEvalRuns(
  directory: string,
  evalRunIds: readonly string[],
  onEvent?: ExecutionObserver,
  options: { maxCostUSD?: number } = {},
): Promise<EvalRun[]> {
  using results = new Results(resolve(directory, "runner.db"));
  if (results.benchmark!.mergedInto)
    throw new Error(
      `This run was merged into ${results.benchmark!.mergedInto}; use the aggregate run`,
    );
  if (results.benchmark!.state === "running") {
    if (!runnerStopped(results.benchmark!))
      throw new Error("Wait for the active benchmark run");
    recoverStoppedRunner(results);
  }
  const benchmark = results.benchmark!;
  const runtime = await runtimeFingerprint(
    benchmark.definition.container,
    benchmark.definition.judge.verification,
  );
  const plan = retryPlan(benchmark.definition, runtime, results, evalRunIds);
  const workspaces = new Map<string, string>();
  for (const item of plan) {
    const definition = benchmark.definition.evals.find(value => value.id === item.slot.evalId)!;
    const workspace = resolve(directory, "inputs", definition.id, definition.sourceHash, "workspace");
    if (!(await Bun.file(resolve(workspace, "..", "ready")).exists()))
      throw new Error("The saved starting workspace is missing");
    workspaces.set(item.slot.evalId, workspace);
  }
  const estimate = estimateWork(benchmark.definition, results, plan);
  const existing = new Set([...results.evalRuns(), ...results.judgeRuns()].map(run => run.id));
  const spent = () => [...results.evalRuns(), ...results.judgeRuns()]
    .filter(run => !existing.has(run.id))
    .reduce((sum, run) => sum + (run.session?.accounting?.costUSD ?? results.recordedCost(run.id) ?? 0), 0);
  const costBudget = new CostBudget(options.maxCostUSD, spent);
  const estimates = new Map(estimate.items.map(item => [item.slotId, item.estimatedUSD]));
  const context = {
    directory: resolve(directory),
    definition: benchmark.definition,
    runtime,
    results,
    onEvent,
  };
  results.transaction(() => {
    if (results.benchmark!.state === "running") throw new Error("Another operation claimed this run");
    for (const item of plan) {
      const selected = results.slot(item.slot.id);
      if (!selected?.active || selected.evalRunId !== item.slot.evalRunId ||
          selected.judgeRunId !== item.slot.judgeRunId)
        throw new Error("The retry selection changed during preflight");
    }
    results.saveBenchmark({ ...benchmark, runtime, state: "running",
      scheduledSlotIds: plan.map(item => item.slot.id), updatedAt: new Date().toISOString(),
      execution: { startedAt: new Date().toISOString(),
        onlyModels: [...new Set(plan.map(item => item.slot.model))],
        onlyEvals: [...new Set(plan.map(item => item.slot.evalId))],
        onlyRepetitions: [...new Set(plan.map(item => item.slot.repetition))],
        budgetUSD: options.maxCostUSD, estimatedUSD: estimate.estimatedUSD,
        spentUSD: 0, deferred: 0 } });
  });
  const timer = setInterval(
    () =>
      results.saveBenchmark({
        ...results.benchmark!,
        updatedAt: new Date().toISOString(),
        scheduledSlotIds: plan.filter(item => item.action !== "deferred").map(item => item.slot.id),
        execution: { ...results.benchmark!.execution, spentUSD: spent(),
          deferred: plan.filter(item => item.action === "deferred").length },
      }),
    5000,
  );
  try {
    const budget = new ExecutionBudget(benchmark.definition.concurrency);
    const completed = new Map<string, EvalRun>();
    const errors: unknown[] = [];
    await executeQueue(plan, benchmark.definition.concurrency, async item => {
      const release = costBudget.reserve(estimates.get(item.slot.id) ?? null);
      if (!release) {
        item.action = "deferred";
        item.reason = "Retry scheduling budget reached or no estimate is available";
        return;
      }
      try {
        const run = await runEvalPipeline(context, item.slot, workspaces.get(item.slot.evalId)!, budget);
        completed.set(item.slot.id, run);
      } catch (error) {
        errors.push(error);
      } finally { release(); }
    });
    if (errors.length) throw new AggregateError(errors, "One or more retry operations failed");
    return plan.flatMap(item => completed.has(item.slot.id) ? [completed.get(item.slot.id)!] : []);
  } finally {
    clearInterval(timer);
    results.saveBenchmark({ ...results.benchmark!, execution: { ...results.benchmark!.execution,
      spentUSD: spent(), deferred: plan.filter(item => item.action === "deferred").length } });
    finishBenchmark(context);
  }
}
