import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadBenchmark } from "../../app/load-benchmark";
import type {
  BenchmarkDefinition,
  BenchmarkRun,
  EvalRun,
  RunEvent,
  Slot,
} from "../../types";
import { Results } from "./index";

const runtime: BenchmarkRun["runtime"] = {
  imageId: "image",
  candidateHash: "candidate-runtime",
  judgeHash: "judge-runtime",
};
const time = "2026-01-01T00:00:00.000Z";
const temporary = () =>
  mkdtemp(
    resolve(
      process.platform === "win32" ? "C:/tmp/opencode" : tmpdir(),
      "openeval-store-",
    ),
  );

test("creates only the current schema and rejects a mismatched format", async () => {
  const root = await temporary();
  const path = resolve(root, "runner.db");
  try {
    new Results(path).close();
    using raw = new Database(path);
    expect(raw.query("PRAGMA user_version").get()).toEqual({ user_version: 5 });
    expect(
      raw
        .query("PRAGMA table_info(events)")
        .all()
        .map((row: any) => row.name),
    ).toEqual(["execution_id", "sequence", "value"]);
    raw.exec("PRAGMA user_version=0");
    expect(() => new Results(path)).toThrow("requires results schema 5");
    expect(() => new Results(path, true)).toThrow("requires results schema 5");
    expect(raw.query("PRAGMA user_version").get()).toEqual({ user_version: 0 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function benchmark(id: string, definition: BenchmarkDefinition): BenchmarkRun {
  return {
    id,
    name: "Storage fixture",
    source: definition.directory,
    definition,
    runtime,
    state: "incomplete",
    createdAt: time,
    updatedAt: time,
    scheduledSlotIds: [],
    execution: { startedAt: time, estimatedUSD: 0, spentUSD: 0, deferred: 0 },
  };
}
function candidate(results: Results, repetition: number) {
  const slot: Slot = {
    id: `answer:local/candidate:${repetition}`,
    evalId: "answer",
    model: "local/candidate",
    repetition,
    candidateHash: "candidate",
    judgeHash: "judge",
    evalRunId: null,
    judgeRunId: null,
    active: true,
  };
  const run = results.startEval(slot, {
    evalId: slot.evalId,
    model: slot.model,
    repetition,
    prompt: "Answer.",
    candidateHash: slot.candidateHash,
    sourceHash: "source",
    imageId: runtime.imageId,
    timeoutMs: 1000,
    earlyStop: false,
    runtime,
  });
  results.finishEval({
    ...run,
    state: "completed",
    completedAt: run.startedAt,
    elapsedMs: 0,
    evidence: { directory: "evidence", hash: "recording" },
  });
  return run;
}
function event(run: EvalRun, number: number): RunEvent {
  return {
    executionId: run.id,
    stage: "candidate",
    time,
    event: {
      type: "session.execution.succeeded",
      id: `evt_${run.id}_${number}`,
      created: number,
      durable: { aggregateID: `ses_${run.id}`, seq: number, version: 1 },
      data: { sessionID: `ses_${run.id}` },
    },
  };
}

test("keeps one per-execution event sequence across interleaving and merges", async () => {
  const root = await temporary();
  try {
    await Bun.write(
      resolve(root, "benchmark.ts"),
      'export default {models:["local/candidate"],judge:{model:"local/judge"}};',
    );
    await Bun.write(resolve(root, "evals/answer/prompt.md"), "Answer.");
    await Bun.write(
      resolve(root, "evals/answer/judge.md"),
      "## Criterion: answer — Answer\nPass when correct.",
    );
    const definition = await loadBenchmark(root);
    using target = new Results(":memory:"),
      source = new Results(":memory:");
    target.saveBenchmark(benchmark("target", definition));
    source.saveBenchmark(benchmark("source", definition));
    const a = candidate(source, 1),
      b = candidate(source, 2),
      c = candidate(target, 3);
    source.append(event(a, 10));
    source.append(event(b, 20));
    source.append(event(a, 30));
    target.append(event(c, 40));
    target.append(event(c, 50));
    const checkpoint = {
      directory: "evidence",
      hash: "checkpoint",
      revision: 1,
      through: 1,
      createdAt: time,
    };
    source.saveCheckpoint(a.id, checkpoint);
    const before = source.events(a.id);
    expect(before.map((item) => item.sequence)).toEqual([1, 2]);
    expect(source.events(b.id).map((item) => item.sequence)).toEqual([1]);
    target.mergeFinalized(source);
    target.mergeFinalized(source);
    expect(target.events(a.id)).toEqual(before);
    expect(target.events(a.id, 1)).toEqual(before.slice(1));
    expect(target.lastEvent(a.id)).toBe(2);
    expect(target.eventBounds(a.id)).toEqual({ first: 10, last: 30 });
    expect(target.events(c.id).map((item) => item.sequence)).toEqual([1, 2]);
    expect(target.checkpoint(a.id, checkpoint.hash)).toEqual(checkpoint);
    expect(target.evalRuns()).toHaveLength(3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
