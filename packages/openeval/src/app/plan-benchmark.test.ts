import { expect, test } from "bun:test";
import type {
  BenchmarkDefinition,
  BenchmarkRun,
  JudgeRunInput,
  PlanItem,
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
import { judgeFingerprint } from "./input-fingerprints";
import { finishBenchmark } from "./run-benchmark";

const definition: BenchmarkDefinition = {
  name: "SDK fixture",
  directory: "/benchmark",
  models: ["local/candidate"],
  repetitions: 1,
  concurrency: 1,
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
      kind: "llm",
      agent,
      model: definition.judge.model,
      timeoutMs: definition.judge.timeoutMs,
      websearch: false,
      protocol: JUDGE_PROTOCOL,
      mode: "final",
      runtimeHash: runtime.judgeHash,
      criteria: item.criteria,
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
        scores: {
          answer: {
            value: 1,
            reason: "The fact is present.",
            evidence: [{ kind: "response" }],
            source: "judge.md",
          },
        },
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

test.each([
  { name: "stays while early stopping applies", stopped: true, settings: { earlyStop: true }, action: "reuse" },
  { name: "is re-collected once early stopping is off", stopped: true, settings: {}, action: "candidate" },
  {
    name: "is re-collected for a model early stopping no longer covers",
    stopped: true,
    settings: { earlyStop: { onlyModels: ["local/other"] } },
    action: "candidate",
  },
  { name: "that finished naturally stays reusable", stopped: false, settings: {}, action: "reuse" },
] satisfies Array<{
  name: string;
  stopped: boolean;
  settings: BenchmarkDefinition["evals"][number]["settings"];
  action: PlanItem["action"];
}>)("a session recorded with early stopping $name", ({ stopped, settings, action }) => {
  using results = new Results(":memory:");
  const collected: BenchmarkDefinition = {
    ...definition,
    evals: [{ ...definition.evals[0], settings: { earlyStop: true } }],
  };
  const current: BenchmarkDefinition = {
    ...definition,
    evals: [{ ...definition.evals[0], settings }],
  };
  const item = collected.evals[0];
  const model = definition.models[0];
  const now = new Date().toISOString();
  const slot: Slot = {
    id: slotId(item.id, model, 1),
    evalId: item.id,
    model,
    repetition: 1,
    active: true,
    candidateHash: candidateFingerprint(collected, item.id, model, runtime),
    judgeHash: judgeFingerprint(collected, item.id),
    evalRunId: null,
    judgeRunId: null,
  };
  const candidate = results.startEval(slot, {
    evalId: item.id,
    model,
    repetition: 1,
    prompt: item.prompt,
    candidateHash: slot.candidateHash,
    sourceHash: item.sourceHash,
    imageId: runtime.imageId,
    timeoutMs: 1000,
    earlyStop: true,
    runtime,
  });
  const evidence = { directory: "evidence", hash: "recording" };
  const checkpoint = { ...evidence, revision: 1, through: 3, createdAt: now };
  results.saveCheckpoint(candidate.id, checkpoint);
  const judge = results.startJudge({
    evalRunId: candidate.id,
    evidence: checkpoint,
    rubric: item.judge,
    kind: "llm",
    agent: JUDGE_AGENT,
    model: definition.judge.model,
    judgeHash: slot.judgeHash,
    timeoutMs: 1000,
    websearch: false,
    mode: "monitor",
    runtimeHash: runtime.judgeHash,
    protocol: JUDGE_PROTOCOL,
    criteria: item.criteria,
    monitor: { minIntervalMs: 45_000, maxChecks: 12, maxCostUSD: 1 },
  });
  const judgment = {
    value: 1,
    reason: "The fact is present.",
    scores: {
      answer: {
        value: 1,
        reason: "The fact is present.",
        evidence: [{ kind: "response" as const }],
        source: "judge.md" as const,
      },
    },
  };
  const check = results.startJudgeCheck(judge.id, "early", checkpoint);
  results.finishJudgeCheck({
    ...check,
    state: "completed",
    completedAt: now,
    decision: { kind: "decided", judgment },
  });
  if (stopped)
    results.requestEvalStop(candidate.id, {
      reason: "judge_decided",
      requestedAt: now,
      judgeRunId: judge.id,
      checkId: check.id,
      checkpoint,
    });
  const running = results.evalRun(candidate.id)!;
  results.finishEval({
    ...running,
    state: stopped ? "stopped" : "completed",
    completedAt: now,
    elapsedMs: 0,
    evidence,
    ...(running.stop ? { stop: { ...running.stop, applied: true } } : {}),
  });
  results.finishJudge({
    ...judge,
    state: "completed",
    completedAt: now,
    elapsedMs: 0,
    judgment,
    decisionCheckId: check.id,
  });

  const [planned] = planBenchmark(current, runtime, results);
  expect(planned.action).toBe(action);
  expect(planned.slot.evalRunId).toBe(action === "reuse" ? candidate.id : null);
  expect(planned.slot.previousEvalRunId).toBe(
    action === "reuse" ? undefined : candidate.id,
  );
});

test("completion respects admitted work while retaining scored results from an older runtime", () => {
  const current: BenchmarkDefinition = {
    ...definition,
    evals: ["retained", "collected"].map((id) => ({
      ...definition.evals[0],
      id,
    })),
  };
  const updated = { ...runtime, imageId: "new-image" };
  using results = new Results(":memory:");
  const now = new Date().toISOString();
  const collectedSlot = slotId("collected", current.models[0], 1);
  results.saveBenchmark({
    id: "benchmark_scope",
    name: "Scope",
    source: current.directory,
    createdAt: now,
    updatedAt: now,
    state: "running",
    definition: current,
    runtime: updated,
    scheduledSlotIds: [collectedSlot],
    execution: {
      startedAt: now,
      onlyEvals: ["collected"],
      estimatedUSD: 0,
      spentUSD: 0,
      deferred: 0,
    },
  });
  for (const item of current.evals) {
    const used = item.id === "retained" ? runtime : updated;
    const slot: Slot = {
      id: slotId(item.id, current.models[0], 1),
      evalId: item.id,
      model: current.models[0],
      repetition: 1,
      active: true,
      candidateHash: candidateFingerprint(
        current,
        item.id,
        current.models[0],
        used,
      ),
      judgeHash: judgeFingerprint(current, item.id),
      evalRunId: null,
      judgeRunId: null,
    };
    const candidate = results.startEval(slot, {
      evalId: item.id,
      model: slot.model,
      repetition: 1,
      prompt: item.prompt,
      candidateHash: slot.candidateHash,
      sourceHash: item.sourceHash,
      imageId: used.imageId,
      timeoutMs: 1000,
      earlyStop: false,
      runtime: used,
    });
    const evidence = { directory: "evidence", hash: item.id };
    results.finishEval({
      ...candidate,
      state: "completed",
      completedAt: now,
      elapsedMs: 0,
      evidence,
    });
    const judge = results.startJudge({
      evalRunId: candidate.id,
      evidence,
      rubric: item.judge,
      kind: "llm",
      agent: JUDGE_AGENT,
      model: current.judge.model,
      judgeHash: slot.judgeHash,
      timeoutMs: 1000,
      websearch: false,
      mode: "final",
      runtimeHash: used.judgeHash,
      protocol: JUDGE_PROTOCOL,
      criteria: item.criteria,
    });
    results.finishJudge({
      ...judge,
      state: "completed",
      completedAt: now,
      elapsedMs: 0,
      judgment: {
        value: 1,
        reason: "Recorded answer",
        scores: {
          answer: {
            value: 1,
            reason: "Recorded answer",
            evidence: [{ kind: "response" }],
            source: "judge.md",
          },
        },
      },
    });
  }
  const before = results.evalRuns();
  const context = {
    directory: "/benchmark",
    definition: current,
    runtime: updated,
    results,
  };
  expect(
    planBenchmark(current, updated, results).find(
      (item) => item.slot.evalId === "retained",
    )?.action,
  ).toBe("candidate");
  expect(finishBenchmark(context).state).toBe("completed");
  expect(results.evalRuns()).toEqual(before);
  results.saveBenchmark({
    ...results.benchmark!,
    state: "running",
    scheduledSlotIds: [slotId("retained", current.models[0], 1)],
  });
  expect(finishBenchmark(context).state).toBe("incomplete");
});
