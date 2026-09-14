import { resolve } from "node:path";
import type { ModelRef } from "../types";
import { Results } from "../infra/sqlite";
import { modelRef } from "./load-benchmark";
import { readBenchmarkRun } from "./read-run";
import { finishBenchmark } from "./run-benchmark";

/** Retire active model selections while preserving every execution and artifact. */
export async function removeModels(
  directory: string,
  models: readonly ModelRef[],
) {
  const root = resolve(directory);
  const removed = [...new Set(models.map(modelRef))];
  if (!removed.length) throw new Error("Select models to remove");
  const before = readBenchmarkRun(root).benchmark;

  using results = new Results(resolve(root, "runner.db"));
  return results.transaction(() => {
    const current = results.benchmark!;
    if (current.id !== before.id || current.mergedInto)
      throw new Error(
        "Benchmark was replaced or merged; use its current aggregate",
      );
    if (current.state === "running")
      throw new Error(
        "Cannot remove models while the benchmark run is running",
      );
    if (removed.some((model) => !current.definition.models.includes(model)))
      throw new Error("Select models present in this benchmark run");
    const remaining = current.definition.models.filter(
      (model) => !removed.includes(model),
    );
    if (!remaining.length)
      throw new Error("Keep at least one model in the benchmark run");
    const retired = results
      .slots()
      .filter((slot) => slot.active && removed.includes(slot.model));
    for (const slot of retired) results.select({ ...slot, active: false });
    const definition = { ...current.definition, models: remaining };
    results.saveBenchmark({
      ...current,
      definition,
      execution: { ...current.execution, deferred: 0 },
    });
    const benchmark = finishBenchmark({
      directory: root,
      definition,
      runtime: current.runtime,
      results,
    });
    results.saveBenchmark(benchmark, true);
    return {
      directory: root,
      removed,
      retiredSlots: retired.length,
      benchmark,
    };
  });
}
