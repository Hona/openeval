import { resolve } from "node:path";
import type { ModelNames } from "../types";
import { Results } from "../infra/sqlite";
import { readModelNames } from "../infra/containers/catalog";
import { withModelNames } from "./model-name-metadata";

/** Refresh catalog names, or apply names read from an authoritative provider catalog. */
export async function refreshModelNames(directory: string, names?: ModelNames) {
  using results = new Results(resolve(directory, "runner.db"));
  const current = results.benchmark;
  if (!current) throw new Error("No benchmark run in this directory");
  if (current.mergedInto) throw new Error("Refresh names on the aggregate benchmark run");
  const fresh = names ?? await readModelNames(current.definition, current.runtime.imageId);
  // Re-read under the write lock: a live runner may have updated progress while
  // catalog discovery was in flight. Never replace that progress or its heartbeat.
  return results.transaction(() => {
    const benchmark = withModelNames(results.benchmark!, fresh);
    results.saveBenchmark(benchmark);
    return { directory: resolve(directory), modelNames: benchmark.modelNames };
  });
}
