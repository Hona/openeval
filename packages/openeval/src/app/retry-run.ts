import { resolve } from "node:path";
import type { ExecutionObserver } from "../types";
import { Results } from "../infra/sqlite";
import { runtimeFingerprint } from "../infra/containers/oci";
import { candidateFingerprint } from "./plan-benchmark";
import { runEvalPipeline } from "./run-eval-pipeline";
import { ExecutionBudget } from "./execution-budget";
import { finishBenchmark } from "./run-benchmark";

export async function retryEvalRun(
  directory: string,
  evalRunId: string,
  onEvent?: ExecutionObserver,
) {
  using results = new Results(resolve(directory, "runner.db"));
  const benchmark = results.benchmark!;
  if (benchmark.mergedInto)
    throw new Error(
      `This run was merged into ${benchmark.mergedInto}; use the aggregate run`,
    );
  if (benchmark.state === "running")
    throw new Error("Wait for the active benchmark run");
  const previous = results.evalRun(evalRunId);
  if (!previous || previous.state === "completed")
    throw new Error(
      "Select a failed eval run; completed evidence can be rejudged",
    );
  const slot = results.slot(previous.slotId)!;
  if (slot.evalRunId !== previous.id)
    throw new Error("Select the current eval run for this repetition");
  const runtime = await runtimeFingerprint(benchmark.definition.container);
  if (
    candidateFingerprint(
      benchmark.definition,
      slot.evalId,
      slot.model,
      runtime,
    ) !== slot.candidateHash
  )
    throw new Error(
      "Declared candidate inputs changed; use run to schedule the affected work",
    );
  const definition = benchmark.definition.evals.find(
    (evalDefinition) => evalDefinition.id === slot.evalId,
  )!;
  const workspace = resolve(
    directory,
    "inputs",
    definition.id,
    definition.sourceHash,
    "workspace",
  );
  if (!(await Bun.file(resolve(workspace, "..", "ready")).exists()))
    throw new Error("The saved starting workspace is missing");
  const context = {
    directory: resolve(directory),
    definition: benchmark.definition,
    runtime,
    results,
    onEvent,
  };
  results.saveBenchmark({
    ...benchmark,
    state: "running",
    scheduledSlotIds: [slot.id],
    updatedAt: new Date().toISOString(),
  });
  const timer = setInterval(
    () =>
      results.saveBenchmark({
        ...results.benchmark!,
        updatedAt: new Date().toISOString(),
      }),
    5000,
  );
  try {
    return await runEvalPipeline(
      context,
      slot,
      workspace,
      new ExecutionBudget(benchmark.definition.concurrency),
    );
  } finally {
    clearInterval(timer);
    finishBenchmark(context);
  }
}
