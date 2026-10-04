import { expect, test } from "bun:test";
import type { BenchmarkDefinition, BenchmarkRun, EvalRun } from "../types";
import { Results } from "../infra/sqlite";
import { JUDGE_AGENT } from "../infra/judging/agent";
import { JUDGE_PROTOCOL } from "../judgment";
import { candidateFingerprint, judgeFingerprint } from "./input-fingerprints";
import { retryPlan } from "./plan-retries";

const definition: BenchmarkDefinition = {
  name: "SDK fixture", directory: "/benchmark", models: ["local/candidate#high"], repetitions: 1,
  concurrency: 2, candidate: { timeoutMs: 2000, websearch: false },
  judge: { model: "local/judge", timeoutMs: 1000, websearch: false },
  container: { engine: "docker", image: "fixture", cpus: 1, memoryMiB: 1024 },
  evals: [{ id: "answer", name: "Answer", directory: "/benchmark/answer", prompt: "Supply the requested fact.",
    judge: "## Criterion: complete — Complete\nPass if complete.", sourceHash: "workspace", judgeHash: "rubric",
    settings: {}, criteria: [{ id: "complete", name: "Complete" }] }],
};
const runtime: BenchmarkRun["runtime"] = { imageId: "image", candidateHash: "runtime", judgeHash: "judge" };

function recorded(state: EvalRun["state"], score?: number | null) {
  const results = new Results(":memory:");
  const old = { ...definition, candidate: { ...definition.candidate, timeoutMs: 1000 } };
  const item = old.evals[0];
  const model = old.models[0];
  const slot = { id: "answer:local/candidate#high:1", evalId: item.id, model, repetition: 1, active: true,
    candidateHash: candidateFingerprint(old, item.id, model, runtime), judgeHash: judgeFingerprint(definition, item.id),
    evalRunId: null, judgeRunId: null };
  const run = results.startEval(slot, { evalId: item.id, model, repetition: 1, prompt: item.prompt,
    candidateHash: slot.candidateHash, sourceHash: item.sourceHash, imageId: runtime.imageId,
    timeoutMs: 1000, earlyStop: false, runtime });
  const evidence = { directory: "evidence", hash: "recording" };
  results.finishEval({ ...run, state, completedAt: run.startedAt, elapsedMs: 0, evidence });
  if (score !== undefined) {
    const judge = results.startJudge({ evalRunId: run.id, evidence, rubric: item.judge, agent: JUDGE_AGENT,
      model: definition.judge.model, kind: "llm", judgeHash: slot.judgeHash, timeoutMs: 1000,
      websearch: false, mode: "final", protocol: JUDGE_PROTOCOL, runtimeHash: runtime.judgeHash, criteria: item.criteria });
    results.finishJudge({ ...judge, state: "completed", completedAt: judge.startedAt, elapsedMs: 0,
      judgment: { value: score, reason: "Constructed control", scores: { complete: {
        value: score, reason: "Constructed control", evidence: [{ kind: "response" }], source: "judge.md" } } } });
  }
  return { results, run };
}

test("explicit retries admit unresolved completed work with the current time limit, without mutations", () => {
  const { results, run } = recorded("completed", null);
  using _ = results;
  const before = JSON.stringify([results.evalRuns(), results.judgeRuns(), results.slots()]);
  const plan = retryPlan(definition, runtime, results, [run.id]);
  expect(plan).toHaveLength(1);
  expect(plan[0].action).toBe("candidate");
  expect(plan[0].slot.evalRunId).toBe(run.id);
  expect(plan[0].slot.candidateHash).toBe(candidateFingerprint(definition, "answer", run.input.model, runtime));
  expect(plan[0].slot.candidateHash).not.toBe(run.input.candidateHash);
  expect(JSON.stringify([results.evalRuns(), results.judgeRuns(), results.slots()])).toBe(before);
});

test.each([0, 1])("fully scored completed work is not retried (score %s)", score => {
  const { results, run } = recorded("completed", score);
  using _ = results;
  expect(() => retryPlan(definition, runtime, results, [run.id])).toThrow("completed-but-unresolved");
});

test("missing judging requests a rejudge, not candidate recollection", () => {
  const { results, run } = recorded("completed");
  using _ = results;
  expect(() => retryPlan(definition, runtime, results, [run.id])).toThrow("completed-but-unresolved");
});

test("failed work can be retried; duplicates, superseded work, and changed task inputs cannot", () => {
  const { results, run } = recorded("failed");
  using _ = results;
  expect(retryPlan(definition, runtime, results, [run.id])[0].action).toBe("candidate");
  expect(() => retryPlan(definition, runtime, results, [run.id, run.id])).toThrow("unique");
  expect(() => retryPlan({ ...definition, evals: [{ ...definition.evals[0], prompt: "Different task" }] }, runtime, results, [run.id])).toThrow("Task inputs");
  expect(() => retryPlan(definition, { ...runtime, imageId: "different" }, results, [run.id])).toThrow("image changed");
  expect(() => retryPlan({ ...definition, candidate: { ...definition.candidate, websearch: "exa" } }, runtime, results, [run.id])).toThrow("other than the time limit");
  results.startEval(results.slot(run.slotId)!, run.input);
  expect(() => retryPlan(definition, runtime, results, [run.id])).toThrow("active EvalRun");
});
