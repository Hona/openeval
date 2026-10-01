import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { BenchmarkDefinition, BenchmarkRun, EvalRun } from "../types";
import { Results } from "../infra/sqlite";
import { planBenchmark } from "./plan-benchmark";
import { ResultReader, evalResultId } from "./read-results";

const definition: BenchmarkDefinition = {
  name: "sql-bench",
  suite: "Frontier",
  directory: "/benchmark",
  models: ["local/current", "local/retired"],
  repetitions: 1,
  concurrency: 2,
  candidate: { timeoutMs: 1000, websearch: false },
  judge: { model: "local/judge", timeoutMs: 1000, websearch: false },
  container: { engine: "docker", image: "fixture", cpus: 1, memoryMiB: 1024 },
  evals: ["answer", "explain"].map((id) => ({
    id,
    name: id,
    directory: `/benchmark/evals/${id}`,
    prompt: "Supply the requested fact.",
    judge: "## Criterion: answer — Answer\nPass if the answer is present.",
    judgeHash: "rubric",
    sourceHash: "workspace",
    settings: {},
    criteria: [{ id: "answer", name: "Answer" }],
  })),
};
const runtime: BenchmarkRun["runtime"] = {
  imageId: "fixture-image",
  candidateHash: "candidate-runtime",
  judgeHash: "judge-runtime",
};

test("activity reads every eval once and reports this invocation, the suite, and active cost", async () => {
  const root = await mkdtemp(
    resolve(process.platform === "win32" ? "C:/tmp/opencode" : tmpdir(), "openeval-reader-"),
  );
  try {
    await mkdir(resolve(root, "run"), { recursive: true });
    const time = "2026-10-02T08:00:00.000Z";
    {
      using results = new Results(resolve(root, "run", "runner.db"));
      results.saveBenchmark({
        id: "benchmark_reader",
        name: definition.name,
        source: definition.directory,
        createdAt: "2026-09-11T08:00:00.000Z",
        updatedAt: time,
        state: "incomplete",
        definition,
        runtime,
        scheduledSlotIds: [],
        execution: { startedAt: time, estimatedUSD: 0, spentUSD: 1.25, deferred: 0 },
      });
      for (const { slot } of planBenchmark(definition, runtime, results)) {
        const run = results.startEval(slot, {
          evalId: slot.evalId,
          model: slot.model,
          repetition: 1,
          prompt: "Supply the requested fact.",
          candidateHash: slot.candidateHash,
          sourceHash: "workspace",
          imageId: runtime.imageId,
          timeoutMs: 1000,
          earlyStop: false,
          runtime,
        });
        results.finishEval({
          ...run,
          state: "completed",
          completedAt: time,
          elapsedMs: 60_000,
          evidence: { directory: "evidence", hash: run.id },
          session: { accounting: { costUSD: slot.model === "local/retired" ? 10 : 2 } } as EvalRun["session"],
        });
      }
      for (const slot of results.slots())
        if (slot.model === "local/retired") results.select({ ...slot, active: false });
    }
    const reader = new ResultReader(root);
    const summary = await reader.summary("benchmark_reader");
    expect(summary.entry.suite).toBe("Frontier");
    expect(summary.overview).toMatchObject({ name: "sql-bench", suite: "Frontier" });
    // Retired selections keep their evidence but no longer count toward this result's cost.
    expect(summary.overview.cost.reportedUSD).toBe(4);

    // Clock-derived durations differ between two reads; compare everything else.
    const timeless = (value: unknown) =>
      JSON.parse(JSON.stringify(value, (key, item) => (["elapsedMs", "runtime"].includes(key) ? undefined : item)));
    const activity = await reader.activity();
    expect(activity.map((row) => row.state.eval)).toEqual(["answer", "explain"]);
    for (const row of activity) {
      expect(row.state).toMatchObject({
        name: "sql-bench",
        suite: "Frontier",
        invocation: { startedAt: time, spentUSD: 1.25 },
      });
      expect(timeless(row.state.runs)).toEqual(
        timeless((await reader.evalRuns(evalResultId("benchmark_reader", row.state.eval))).runs),
      );
      expect(row.state.runs.map((run) => run.model)).toEqual(["local/current"]);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
