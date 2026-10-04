import type { ModelNames, BenchmarkRun } from "../types";

/** Reporting metadata only: no new attempts, selections, fingerprints, or heartbeat. */
export function withModelNames(benchmark: BenchmarkRun, names: ModelNames): BenchmarkRun {
  const known = new Set(benchmark.definition.models.map(model => model.split("#")[0]));
  for (const [model, name] of Object.entries(names))
    if (!known.has(model) || typeof name !== "string" || !name.trim())
      throw new Error("Model display names must name a recorded model and have non-empty text");
  return { ...benchmark, modelNames: { ...benchmark.modelNames, ...names } };
}
