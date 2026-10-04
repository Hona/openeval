import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import type { BenchmarkRun } from "../types";
import { Results } from "../infra/sqlite";
import { refreshModelNames } from "./refresh-model-names";

test("refreshing names on a live aggregate does not replace progress or selections", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "openeval-model-names-"));
  await mkdir(directory, { recursive: true });
  try {
    using results = new Results(resolve(directory, "runner.db"));
    const benchmark = { id: "benchmark_fixture", name: "Fixture", state: "running",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
      definition: { models: ["local/example#high"] }, runtime: { imageId: "fixture-image" },
      scheduledSlotIds: ["slot_fixture"], execution: { spentUSD: 3 },
      modelNames: { "local/example": "example name" },
    } as unknown as BenchmarkRun;
    results.saveBenchmark(benchmark);
    results.select({ id: "slot_fixture", evalId: "fixture", model: "local/example#high", repetition: 1,
      candidateHash: "candidate_fixture", judgeHash: "judge_fixture", active: true,
      evalRunId: null, judgeRunId: null });
    const before = JSON.stringify(results.slots());
    await refreshModelNames(directory, { "local/example": "Example Name" });
    expect(results.benchmark).toEqual({ ...benchmark, modelNames: { "local/example": "Example Name" } });
    expect(JSON.stringify(results.slots())).toBe(before);
    expect(results.evalRuns()).toEqual([]);
    expect(results.judgeRuns()).toEqual([]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
