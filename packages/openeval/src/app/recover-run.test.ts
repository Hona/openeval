import { expect, test } from "bun:test";
import type { BenchmarkDefinition, BenchmarkRun, Slot } from "../types";
import { JUDGE_PROTOCOL } from "../judgment";
import { JUDGE_AGENT } from "../infra/judging/agent";
import { Results } from "../infra/sqlite";
import {
  candidateFingerprint,
  judgeFingerprint,
  planBenchmark,
  slotId,
} from "./plan-benchmark";
import {
  recoverStoppedRunner,
  runnerStopped,
  STOPPED_RUNNER_MS,
} from "./recover-run";

const definition: BenchmarkDefinition = {
  name: "SDK fixture",
  directory: "/benchmark",
  models: ["local/candidate", "local/other"],
  repetitions: 1,
  concurrency: 2,
  candidate: { timeoutMs: 1000, websearch: false },
  judge: { model: "local/judge", timeoutMs: 1000, websearch: false },
  container: { engine: "docker", image: "fixture", cpus: 1, memoryMiB: 1024 },
  evals: [
    {
      id: "answer",
      name: "Answer",
      directory: "/benchmark/evals/answer",
      prompt: "Supply the requested fact.",
      judge:
        "## Criterion: answer — Answer\nPass if the recorded answer supplies the fact.",
      judgeHash: "rubric",
      sourceHash: "workspace",
      settings: {},
      criteria: [{ id: "answer", name: "Answer" }],
    },
  ],
};
const runtime: BenchmarkRun["runtime"] = {
  imageId: "fixture-image",
  candidateHash: "candidate-runtime",
  judgeHash: "judge-runtime",
};

/** One session still running, and one finished session whose judge is still running. */
function stoppedStore() {
  const results = new Results(":memory:");
  const startedAt = new Date(Date.now() - 10 * 60_000).toISOString();
  results.saveBenchmark({
    id: "benchmark_stopped",
    name: "Stopped",
    source: definition.directory,
    createdAt: startedAt,
    updatedAt: startedAt,
    state: "running",
    definition,
    runtime,
    scheduledSlotIds: definition.models.map((model) => slotId("answer", model, 1)),
    execution: { startedAt, estimatedUSD: 0, spentUSD: 0, deferred: 0 },
  });
  const item = definition.evals[0];
  const runs = definition.models.map((model) => {
    const slot: Slot = {
      id: slotId(item.id, model, 1),
      evalId: item.id,
      model,
      repetition: 1,
      active: true,
      candidateHash: candidateFingerprint(definition, item.id, model, runtime),
      judgeHash: judgeFingerprint(definition, item.id),
      evalRunId: null,
      judgeRunId: null,
    };
    return results.startEval(slot, {
      evalId: item.id,
      model,
      repetition: 1,
      prompt: item.prompt,
      candidateHash: slot.candidateHash,
      sourceHash: item.sourceHash,
      imageId: runtime.imageId,
      timeoutMs: 1000,
      earlyStop: false,
      runtime,
    });
  });
  const evidence = { directory: "evidence", hash: "recording" };
  results.finishEval({
    ...runs[1],
    state: "completed",
    completedAt: new Date().toISOString(),
    elapsedMs: 0,
    evidence,
  });
  const judge = results.startJudge({
    evalRunId: runs[1].id,
    evidence,
    rubric: item.judge,
    kind: "llm",
    agent: JUDGE_AGENT,
    model: definition.judge.model,
    judgeHash: judgeFingerprint(definition, item.id),
    timeoutMs: 1000,
    websearch: false,
    mode: "final",
    runtimeHash: runtime.judgeHash,
    protocol: JUDGE_PROTOCOL,
    criteria: item.criteria,
  });
  return { results, candidate: runs[0], judged: runs[1], judge };
}

test("a fresh heartbeat is a live runner; an old one is a stopped runner", () => {
  const now = Date.now();
  const at = (age: number) => new Date(now - age).toISOString();
  expect(runnerStopped({ state: "running", updatedAt: at(5_000) }, now)).toBe(false);
  expect(runnerStopped({ state: "running", updatedAt: at(STOPPED_RUNNER_MS + 1) }, now)).toBe(true);
  expect(runnerStopped({ state: "incomplete", updatedAt: at(STOPPED_RUNNER_MS * 10) }, now)).toBe(false);
});

test("recovery keeps interrupted records and plans only the interrupted work again", () => {
  const { results, candidate, judged, judge } = stoppedStore();
  using _ = results;
  const dryRun = planBenchmark(definition, runtime, results, { stoppedRunner: true });

  expect(recoverStoppedRunner(results)).toEqual({ evalRuns: 1, judgeRuns: 1 });
  expect(results.evalRun(candidate.id)).toMatchObject({ state: "failed", interrupted: true });
  expect(results.evalRun(judged.id)?.state).toBe("completed");
  expect(results.judgeRun(judge.id)).toMatchObject({ state: "failed", interrupted: true });
  expect(results.benchmark?.state).toBe("incomplete");

  const plan = planBenchmark(definition, runtime, results);
  expect(plan.map((item) => [item.slot.model, item.action, item.reason])).toEqual([
    ["local/candidate", "candidate", "The runner stopped during this session; collecting it again"],
    ["local/other", "judge", "The runner stopped during judging; judging again"],
  ]);
  expect(plan[0].slot.previousEvalRunId).toBe(candidate.id);
  expect(plan[1].slot.evalRunId).toBe(judged.id);
  expect(dryRun.map((item) => item.action)).toEqual(plan.map((item) => item.action));
});

test("a failure the runner did not cause still needs an explicit retry", () => {
  const { results, candidate } = stoppedStore();
  using _ = results;
  results.finishEval({
    ...candidate,
    state: "failed",
    error: "Provider request failed",
    completedAt: new Date().toISOString(),
    elapsedMs: 0,
  });
  expect(planBenchmark(definition, runtime, results)[0]).toMatchObject({
    action: "failed",
    reason: "Candidate failed; explicit retry required",
  });
});
