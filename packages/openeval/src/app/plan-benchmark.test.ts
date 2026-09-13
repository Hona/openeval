import { expect, test } from "bun:test";
import type {
  BenchmarkDefinition,
  BenchmarkRun,
  JudgeRunInput,
  Slot,
} from "../types";
import { JUDGE_PROTOCOL } from "../judgment";
import { JUDGE_AGENT } from "../infra/judging/agent";
import { Results } from "../infra/sqlite";
import {
  candidateFingerprint,
  savedJudgeFingerprint,
} from "./input-fingerprints";
import { planBenchmark, slotId } from "./plan-benchmark";

const definition: BenchmarkDefinition = {
  name: "SDK fixture",
  directory: "/benchmark",
  models: ["local/candidate"],
  repetitions: 1,
  concurrency: 1,
  candidate: { agent: "build", timeoutMs: 1000, websearch: false },
  judge: { model: "local/judge", timeoutMs: 1000, websearch: false },
  container: { engine: "docker", image: "fixture", cpus: 1, memoryMiB: 1024 },
  evals: [
    {
      id: "answer",
      name: "Answer",
      directory: "/benchmark/evals/answer",
      prompt: "Supply the requested fact.",
      judge:
        "## Metric: answer — Answer\nPass if the recorded answer supplies the fact.",
      judgeHash: "rubric",
      sourceHash: "workspace",
      settings: {},
      metrics: [{ id: "answer", name: "Answer" }],
    },
  ],
};
const runtime: BenchmarkRun["runtime"] = {
  imageId: "fixture-image",
  candidateHash: "candidate-runtime",
  judgeHash: "judge-runtime",
};

test("candidate reuse includes the starting agent, workers and their provider settings", () => {
  const candidate: BenchmarkDefinition["candidate"] = {
    ...definition.candidate,
    agent: "coordinator",
    agents: {
      worker: { mode: "subagent", model: "worker/solver", system: "Solve." },
    },
    providers: { worker: { name: "Worker provider" } },
  };
  const hash = (value: BenchmarkDefinition["candidate"]) =>
    candidateFingerprint(
      { ...definition, candidate: value },
      "answer",
      "local/candidate",
      runtime,
    );
  const before = hash(candidate);
  for (const change of [
    { ...candidate, agent: "build" },
    {
      ...candidate,
      agents: {
        worker: { ...candidate.agents!.worker, model: "worker/other" },
      },
    },
    {
      ...candidate,
      agents: { worker: { ...candidate.agents!.worker, system: "Review." } },
    },
    {
      ...candidate,
      providers: { worker: { name: "Changed worker provider" } },
    },
  ])
    expect(hash(change)).not.toBe(before);
  expect(
    hash({
      ...candidate,
      providers: {
        ...candidate.providers,
        unrelated: { name: "Unused provider" },
      },
    }),
  ).toBe(before);
});

test.each([
  {
    name: "changed shared prompt",
    agent: { ...JUDGE_AGENT, system: "Earlier judge instructions" },
    action: "judge",
  },
  { name: "unchanged shared prompt", agent: JUDGE_AGENT, action: "reuse" },
])(
  "plans $action for $name while retaining candidate evidence",
  ({ agent, action }) => {
    using results = new Results(":memory:");
    const item = definition.evals[0];
    const candidateHash = candidateFingerprint(
      definition,
      item.id,
      definition.models[0],
      runtime,
    );
    const input: JudgeRunInput = {
      evalRunId: "pending",
      evidence: { directory: "evidence", hash: "recording" },
      rubric: item.judge,
      agent,
      model: definition.judge.model,
      timeoutMs: definition.judge.timeoutMs,
      websearch: false,
      protocol: JUDGE_PROTOCOL,
      mode: "final",
      runtimeHash: runtime.judgeHash,
      metrics: item.metrics,
      judgeHash: "pending",
    };
    input.judgeHash = savedJudgeFingerprint(input);
    const slot: Slot = {
      id: slotId(item.id, definition.models[0], 1),
      evalId: item.id,
      model: definition.models[0],
      repetition: 1,
      candidateHash,
      judgeHash: input.judgeHash,
      active: true,
      evalRunId: null,
      judgeRunId: null,
    };
    const candidate = results.startEval(slot, {
      evalId: item.id,
      model: slot.model,
      repetition: 1,
      prompt: item.prompt,
      candidateHash,
      sourceHash: item.sourceHash,
      imageId: runtime.imageId,
      timeoutMs: 1000,
      earlyStop: false,
      runtime,
    });
    results.finishEval({
      ...candidate,
      state: "completed",
      completedAt: candidate.startedAt,
      elapsedMs: 0,
      evidence: input.evidence,
    });
    const judge = results.startJudge({ ...input, evalRunId: candidate.id });
    results.finishJudge({
      ...judge,
      state: "completed",
      completedAt: judge.startedAt,
      elapsedMs: 0,
      judgment: {
        value: 1,
        reason: "The fact is present.",
        metrics: [
          {
            id: "answer",
            value: 1,
            reason: "The fact is present.",
            evidence: [{ kind: "response" }],
          },
        ],
      },
    });
    const original = JSON.stringify([
      results.evalRuns(),
      results.judgeRuns(),
      results.slots(),
    ]);
    const plan = planBenchmark(definition, runtime, results);
    expect(plan).toHaveLength(1);
    expect(plan[0].action).toBe(action);
    expect(plan[0].slot.evalRunId).toBe(candidate.id);
    expect(plan[0].slot.judgeRunId).toBe(action === "reuse" ? judge.id : null);
    expect(
      JSON.stringify([
        results.evalRuns(),
        results.judgeRuns(),
        results.slots(),
      ]),
    ).toBe(original);
  },
);
