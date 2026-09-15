import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  BenchmarkRun,
  BenchmarkDefinition,
  ModelRef,
  ExecutionObserver,
  PlanItem,
} from "../types";
import { Results } from "../infra/sqlite";
import { runtimeFingerprint } from "../infra/containers/oci";
import { prepareWorkspace } from "../infra/containers/workspace";
import { fingerprint, errorMessage } from "../infra/files";
import { loadBenchmark, modelRef } from "./load-benchmark";
import { planBenchmark } from "./plan-benchmark";
import { runEvalPipeline } from "./run-eval-pipeline";
import { ExecutionBudget } from "./execution-budget";
import { judgeEvalRun } from "./judge-run";
import type { ExecutionContext } from "./context";
import { canJudgeEval } from "./eval-state";
import { isScored } from "../judgment";
import { benchmarkScores } from "./scores";
import { CostBudget, estimateWork } from "./cost-plan";

export type RunBenchmarkOptions = {
  directory?: string;
  fresh?: boolean;
  dryRun?: boolean;
  models?: readonly ModelRef[];
  /** Execute work only for these models while retaining the full aggregate. */
  onlyModels?: readonly ModelRef[];
  onlyEvals?: readonly string[];
  onlyRepetitions?: readonly number[];
  /** Stop admitting work when reported spend plus reservations reaches this amount. */
  maxCostUSD?: number;
  finalOnly?: boolean;
  onEvent?: ExecutionObserver;
};

export async function currentBenchmarkRun(directory: string) {
  const root = resolve(directory, "results");
  const dirs = (await readdir(root, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const dir of dirs) {
    const path = resolve(root, dir, "runner.db");
    if (!(await Bun.file(path).exists())) continue;
    using results = new Results(path, true);
    if (results.benchmark && !results.benchmark.mergedInto)
      return resolve(root, dir);
  }
}

export function finishBenchmark(context: ExecutionContext) {
  const slots = context.results.slots().filter((slot) => slot.active);
  const executions = context.results.evalRuns(),
    judges = context.results.judgeRuns();
  const failed = slots.some(
    (slot) =>
      executions.some(
        (run) =>
          run.id === slot.evalRunId &&
          (run.state === "failed" ||
            (run.state === "timed_out" && !canJudgeEval(run))),
      ) ||
      (judges.some(
        (run) =>
          run.input.evalRunId === slot.evalRunId &&
          run.input.judgeHash === slot.judgeHash &&
          ["failed", "timed_out"].includes(run.state),
      ) &&
        !slot.judgeRunId),
  );
  const complete =
    slots.length > 0 &&
    slots.every((slot) =>
      judges.some(
        (run) => run.id === slot.judgeRunId && isScored(run.judgment?.value),
      ),
    ) &&
    benchmarkScores(context.definition, slots, judges).every(
      (score) => score.percentage !== null,
    );
  const currentInputs = planBenchmark(
    context.definition,
    context.runtime,
    context.results,
  ).every((item) => item.action === "reuse");
  const previous = context.results.benchmark!;
  const ended = [...executions, ...judges]
    .map((run) => run.completedAt)
    .filter((value): value is string => !!value)
    .sort()
    .at(-1);
  const benchmark: BenchmarkRun = {
    ...previous,
    state:
      complete && currentInputs
        ? "completed"
        : failed
          ? "failed"
          : "incomplete",
    updatedAt: new Date().toISOString(),
    completedAt: ended ?? previous.completedAt,
    scheduledSlotIds: [],
  };
  context.results.saveBenchmark(benchmark);
  return benchmark;
}

export async function runBenchmark(
  path: string,
  options: RunBenchmarkOptions = {},
) {
  const definition = await loadBenchmark(path);
  if (
    options.onlyRepetitions &&
    (!options.onlyRepetitions.length ||
      options.onlyRepetitions.some(
        (value) =>
          !Number.isSafeInteger(value) ||
          value < 1 ||
          value > definition.repetitions,
      ))
  )
    throw new Error(
      "Select repetition numbers within the benchmark's configured range",
    );
  if (
    options.onlyEvals &&
    (!options.onlyEvals.length ||
      options.onlyEvals.some(
        (id) => !definition.evals.some((item) => item.id === id),
      ))
  )
    throw new Error("Select configured eval IDs with --only-eval");
  new CostBudget(options.maxCostUSD, () => 0);
  const selected = options.onlyModels?.map(modelRef);
  if (selected && !selected.length)
    throw new Error("Select at least one model");
  const runtime = await runtimeFingerprint(definition.container);
  let directory =
    options.directory ??
    (!options.fresh
      ? await currentBenchmarkRun(definition.directory)
      : undefined);
  if (directory) {
    using previous = new Results(resolve(directory, "runner.db"), true);
    const saved = previous.benchmark!;
    if (saved.mergedInto)
      throw new Error(
        `This run was merged into ${saved.mergedInto}; use the aggregate run`,
      );
    if (saved.state === "running")
      throw new Error("This benchmark run is already running");
    definition.models = [
      ...new Set([...saved.definition.models, ...definition.models]),
    ];
  }
  if (options.models)
    definition.models = [
      ...new Set([...definition.models, ...options.models.map(modelRef)]),
    ];
  if (selected) {
    for (const model of selected)
      if (!definition.models.includes(model))
        throw new Error(`Model is not configured: ${model}`);
  }
  const now = new Date().toISOString();
  directory = resolve(
    directory ??
      resolve(
        definition.directory,
        "results",
        `${now.replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`,
      ),
  );
  const database = resolve(directory, "runner.db");
  using results = options.dryRun
    ? (await Bun.file(database).exists())
      ? new Results(database, true)
      : new Results(":memory:")
    : new Results(database);
  const previousSelections = new Map(
    results.slots().map((slot) => [slot.id, slot]),
  );
  let plan = planBenchmark(definition, runtime, results);
  if (selected || options.onlyEvals || options.onlyRepetitions) {
    const retained = new Map(results.slots().map((slot) => [slot.id, slot]));
    plan = plan.map((item) =>
      ((!selected || selected.includes(item.slot.model)) &&
        (!options.onlyEvals || options.onlyEvals.includes(item.slot.evalId)) &&
        (!options.onlyRepetitions ||
          options.onlyRepetitions.includes(item.slot.repetition))) ||
      item.action === "reuse"
        ? item
        : {
            slot: retained.get(item.slot.id) ?? item.slot,
            action: "deferred" as const,
            reason:
              "Outside selected eval/model scope; existing selections retained",
          },
    );
  }
  const estimate = estimateWork(definition, results, plan);
  if (options.dryRun)
    return { directory, plan, estimate, benchmark: results.benchmark };
  const work = plan.filter(
    (item) => item.action === "candidate" || item.action === "judge",
  );
  const previous = results.benchmark;
  if (
    !work.length &&
    previous &&
    fingerprint(previous.definition) === fingerprint(definition) &&
    fingerprint(previous.runtime) === fingerprint(runtime)
  )
    return { directory, plan, estimate, benchmark: previous };
  const benchmark: BenchmarkRun = {
    id: previous?.id ?? `benchmark_${randomUUID()}`,
    name: definition.name,
    source: definition.directory,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    state: "running",
    scheduledSlotIds: work.map((item) => item.slot.id),
    definition,
    runtime,
    sources: previous?.sources,
    execution: {
      startedAt: now,
      onlyModels: selected,
      onlyEvals: options.onlyEvals,
      onlyRepetitions: options.onlyRepetitions,
      budgetUSD: options.maxCostUSD,
      estimatedUSD: estimate.estimatedUSD,
      spentUSD: 0,
      deferred: 0,
    },
  };
  // Freeze project seeds once before any session starts. Every repetition copies these seeds.
  const workspaces = new Map<string, string>();
  for (const item of work.filter((item) => item.action === "candidate")) {
    if (workspaces.has(item.slot.evalId)) continue;
    const evalDefinition = definition.evals.find(
      (evalDefinition) => evalDefinition.id === item.slot.evalId,
    )!;
    const seed = resolve(
      directory,
      "inputs",
      evalDefinition.id,
      evalDefinition.sourceHash,
      "workspace",
    );
    if (!(await Bun.file(resolve(seed, "..", "ready")).exists())) {
      await prepareWorkspace(evalDefinition, seed);
      await Bun.write(resolve(seed, "..", "ready"), evalDefinition.sourceHash);
    }
    workspaces.set(evalDefinition.id, seed);
  }
  const unchanged = await loadBenchmark(path);
  if (fingerprint(unchanged.evals) !== fingerprint(definition.evals))
    throw new Error(
      "Eval files changed during preparation; run again to use a consistent snapshot",
    );
  results.transaction(() => {
    if (results.benchmark?.state === "running")
      throw new Error("Another runner claimed this benchmark run");
    results.saveBenchmark(benchmark, true);
    const selected = new Set(plan.map((item) => item.slot.id));
    for (const slot of results.slots())
      if (!selected.has(slot.id)) results.select({ ...slot, active: false });
    for (const item of plan) results.select(item.slot);
  });
  const context: ExecutionContext = {
    directory,
    definition,
    runtime,
    results,
    onEvent: options.onEvent,
    finalOnly: options.finalOnly,
  };
  // Snapshot costs by execution identity: resumed historical work is not charged again.
  const existing = new Set(
    [...results.evalRuns(), ...results.judgeRuns()].map((run) => run.id),
  );
  const spent = () =>
    [...results.evalRuns(), ...results.judgeRuns()]
      .filter((run) => !existing.has(run.id))
      .reduce(
        (sum, run) =>
          sum +
          (run.session?.accounting?.costUSD ??
            results.recordedCost(run.id) ??
            0),
        0,
      );
  const costBudget = new CostBudget(options.maxCostUSD, spent);
  const estimates = new Map(
    estimate.items.map((item) => [item.slotId, item.estimatedUSD]),
  );
  const heartbeat = setInterval(
    () =>
      results.saveBenchmark({
        ...results.benchmark!,
        updatedAt: new Date().toISOString(),
        scheduledSlotIds: work
          .filter((item) => item.action !== "deferred")
          .map((item) => item.slot.id),
        execution: {
          ...benchmark.execution!,
          spentUSD: spent(),
          deferred: plan.filter((item) => item.action === "deferred").length,
        },
      }),
    5000,
  );
  try {
    const budget = new ExecutionBudget(definition.concurrency);
    await executeQueue(work, definition.concurrency, async (item) => {
      const release = costBudget.reserve(estimates.get(item.slot.id) ?? null);
      if (!release) {
        item.action = "deferred";
        item.reason =
          "Scheduling cost budget reached or no estimate is available";
        const old = previousSelections.get(item.slot.id);
        if (old) results.select(old);
        return;
      }
      try {
        if (item.action === "candidate")
          await runEvalPipeline(
            context,
            item.slot,
            workspaces.get(item.slot.evalId)!,
            budget,
          );
        else
          await budget.run("judge", () =>
            judgeEvalRun(context, results.evalRun(item.slot.evalRunId!)!),
          );
      } finally {
        release();
      }
    });
    results.saveBenchmark({
      ...results.benchmark!,
      execution: {
        ...benchmark.execution!,
        spentUSD: spent(),
        deferred: plan.filter((item) => item.action === "deferred").length,
      },
    });
    return { directory, plan, estimate, benchmark: finishBenchmark(context) };
  } catch (error) {
    results.saveBenchmark({
      ...results.benchmark!,
      state: "failed",
      error: errorMessage(error),
      updatedAt: new Date().toISOString(),
      execution: {
        ...benchmark.execution!,
        spentUSD: spent(),
        deferred: plan.filter((item) => item.action === "deferred").length,
      },
    });
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

export async function executeQueue<T>(
  items: readonly T[],
  concurrency: number,
  work: (item: T) => Promise<void>,
) {
  let next = 0,
    stopped = false;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      for (;;) {
        if (stopped) return;
        const index = next++;
        if (index >= items.length) return;
        try {
          await work(items[index]);
        } catch (error) {
          stopped = true;
          throw error;
        }
      }
    },
  );
  const outcomes = await Promise.allSettled(workers);
  const failure = outcomes.find(
    (outcome): outcome is PromiseRejectedResult =>
      outcome.status === "rejected",
  );
  if (failure) throw failure.reason;
}
