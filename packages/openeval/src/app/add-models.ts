import type { ModelRef, ExecutionObserver } from "../types";
import { Results } from "../infra/sqlite";
import { resolve } from "node:path";
import { runBenchmark } from "./run-benchmark";

export async function addModels(
  directory: string,
  models: readonly ModelRef[],
  onEvent?: ExecutionObserver,
) {
  if (!models.length) throw new Error("Select models to add");
  let source: string;
  {
    using results = new Results(resolve(directory, "runner.db"), true);
    source = results.benchmark!.source;
  }
  return runBenchmark(source, { directory, models, onEvent });
}
