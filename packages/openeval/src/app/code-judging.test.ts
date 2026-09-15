import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadBenchmark } from "./load-benchmark";
import { judgeEvidence, recordEvidence } from "./judge-evidence";
import { gradeRecording } from "./grade-recording";
import { judgeEvalRun } from "./judge-run";
import { judgeRuns } from "./rejudge";
import {
  readBenchmarkRun,
  readEvidence,
  verifyJudgmentEvidence,
} from "./read-run";
import { planBenchmark } from "./plan-benchmark";
import { benchmarkScores } from "./scores";
import { Results } from "../infra/sqlite";
import { JUDGE_AGENT } from "../infra/judging/agent";
import { JUDGE_PROTOCOL } from "../judgment";
import { validateCriteria } from "../infra/judging/contract";
import type { JudgeRunInput, BenchmarkRun } from "../types";

const temporary = () =>
  mkdtemp(
    resolve(
      process.platform === "win32" ? "C:/tmp/opencode" : tmpdir(),
      "openeval-code-",
    ),
  );
async function fixture(code: string) {
  const root = await temporary();
  await Bun.write(
    resolve(root, "benchmark.ts"),
    'export default { models: ["local/candidate"], repetitions: 1, judge: { timeoutMs: 5000 } };',
  );
  const directory = resolve(root, "evals/answer");
  await Bun.write(resolve(directory, "prompt.md"), "Return READY.");
  await Bun.write(resolve(directory, "judge.ts"), code);
  const evidence = await recordEvidence({
    directory: resolve(root, "evidence"),
    prompt: "Return READY.",
    response: "READY",
    tools: [
      {
        id: "one",
        name: "read",
        assistantMessageId: "answer",
        status: "succeeded",
      },
      {
        id: "two",
        name: "read",
        assistantMessageId: "answer",
        status: "failed",
        error: "Missing path",
      },
    ],
  });
  return { root, directory, evidence };
}

test("a code-only eval loads without a judge model and grades booleans, fractions, and metadata", async () => {
  const item = await fixture(`import { credit } from "./credit";
export default ({response, metrics, recording}) => ({
  scores: { answer: response.text === "READY", coverage: credit },
  observations: { errors: metrics.tools.errorRate, calls: recording.tools().length },
});`);
  try {
    await Bun.write(
      resolve(item.directory, "credit.ts"),
      "export const credit = 0.25;",
    );
    const definition = await loadBenchmark(item.root);
    expect(definition.judge.model).toBeUndefined();
    expect(definition.evals[0].criteria).toEqual([]);
    expect(definition.evals[0].code?.sourceMap).toContain("credit.ts");
    const result = await judgeEvidence({
      evidence: item.evidence,
      code: resolve(item.directory, "judge.ts"),
      directory: resolve(item.root, "judged"),
    });
    expect(result.state).toBe("completed");
    expect(result.session).toBeUndefined();
    expect(result.judgment?.value).toBe(0.625);
    expect(result.judgment?.scores.answer.value).toBe(1);
    expect(result.code?.output).toEqual({
      scores: { answer: true, coverage: 0.25 },
      observations: { errors: 0.5, calls: 2 },
    });
    expect(result.code?.metrics?.cost.usd).toBeNull();
    expect(result.code?.metrics?.tools.errorRate).toBe(0.5);
    const view = await readEvidence(item.evidence);
    expect(
      (await view.query({ action: "metrics", metric: "tools.errorRate" }))
        .value,
    ).toBe(0.5);
    const measured = validateCriteria(
      {
        reliability: {
          value: 0.5,
          reason: "Half the terminal tool calls failed.",
          evidence: [{ kind: "metric", id: "tools.errorRate", quote: "0.5" }],
        },
      },
      [{ id: "reliability", name: "Tool reliability" }],
    );
    expect(
      (await verifyJudgmentEvidence(measured, item.evidence)).criteria,
    ).toBe(1);
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test("planning compiles code without executing it and fingerprints imported references", async () => {
  const item = await fixture(
    'import { answer } from "./reference"; throw new Error("Do not execute while planning"); export default () => ({scores:{answer}});',
  );
  try {
    await Bun.write(
      resolve(item.directory, "reference.ts"),
      "export const answer = true;",
    );
    const before = await loadBenchmark(item.root);
    await Bun.write(
      resolve(item.directory, "reference.ts"),
      "export const answer = false;",
    );
    const after = await loadBenchmark(item.root);
    expect(before.evals[0].sourceHash).toBe(after.evals[0].sourceHash);
    expect(before.evals[0].code?.hash).not.toBe(after.evals[0].code?.hash);
    await Bun.write(
      resolve(item.directory, "eval.ts"),
      "export default {earlyStop:true};",
    );
    await expect(loadBenchmark(item.root)).rejects.toThrow(
      "finalized recordings",
    );
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test("code output without scores is retained as unscored data", async () => {
  const item = await fixture(
    'export default () => ({ observation: ["ready", true, null] });',
  );
  try {
    const result = await judgeEvidence({
      evidence: item.evidence,
      code: resolve(item.directory, "judge.ts"),
      directory: resolve(item.root, "judged"),
    });
    expect(result.state).toBe("completed");
    expect(result.judgment?.value).toBeNull();
    expect(result.judgment?.scores).toEqual({});
    expect(result.code?.output).toEqual({ observation: ["ready", true, null] });
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test.each([
  ["export default () => ({ scores: { answer: 1.5 } });", "from 0 to 1"],
  ['export default () => ({ scores: { answer: "true" } });', "from 0 to 1"],
  ["export default () => ({ scores: { answer: NaN } });", "JSON-compatible"],
  ['export default () => { throw new Error("Rule failed"); };', "Rule failed"],
])("code failures are judging errors: %s", async (code, error) => {
  const item = await fixture(code);
  try {
    const result = await judgeEvidence({
      evidence: item.evidence,
      code: resolve(item.directory, "judge.ts"),
      directory: resolve(item.root, "judged"),
    });
    expect(result.state).toBe("failed");
    expect(result.error).toContain(error);
    expect(result.judgment).toBeUndefined();
    expect(result.code?.metrics?.tools.calls).toBe(2);
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test("a synchronous infinite loop is stopped by the host deadline", async () => {
  const item = await fixture("export default () => { while (true) {} };");
  try {
    const started = Date.now();
    const result = await judgeEvidence({
      evidence: item.evidence,
      code: resolve(item.directory, "judge.ts"),
      judge: { timeoutMs: 200 },
      directory: resolve(item.root, "judged"),
    });
    expect(result.state).toBe("timed_out");
    expect(result.error).toContain("time limit");
    expect(Date.now() - started).toBeLessThan(5000);
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test("Markdown and code contribute distinct scores from the same recording", async () => {
  const item = await fixture(
    "export default () => ({ scores: { computed: 0.5 } });",
  );
  try {
    const definition = await loadBenchmark(item.root);
    const input: JudgeRunInput = {
      evalRunId: "recorded",
      evidence: item.evidence,
      kind: "hybrid",
      code: definition.evals[0].code,
      rubric: "## Criterion: reviewed — Reviewed\nPass when ready.",
      criteria: [{ id: "reviewed", name: "Reviewed" }],
      agent: JUDGE_AGENT,
      model: "local/judge",
      timeoutMs: 5000,
      websearch: false,
      judgeHash: "test",
      mode: "final",
      runtimeHash: "test",
      protocol: JUDGE_PROTOCOL,
    };
    let calls = 0;
    const result = await gradeRecording(
      input,
      { evidence: item.evidence },
      resolve(item.root, "judged"),
      () => {},
      async (received) => {
        calls++;
        expect(received.evidence).toEqual(item.evidence);
        return {
          result: { state: "completed", sessions: [], text: "", tools: [] },
          session: {
            sessionId: "local",
            database: "local.db",
            databaseHash: "test",
            opencodeVersion: "test",
          },
          judgment: validateCriteria(
            {
              reviewed: {
                value: true,
                reason: "Recorded response",
                evidence: [{ kind: "response" }],
              },
            },
            input.criteria,
          ),
        };
      },
    );
    expect(calls).toBe(1);
    expect(result.state).toBe("completed");
    expect(result.judgment?.value).toBe(0.75);
    expect(result.judgment?.scores.computed.source).toBe("judge.ts");
    expect(result.judgment?.scores.reviewed.source).toBe("judge.md");
    input.criteria = [{ id: "computed", name: "Computed" }];
    const collision = await gradeRecording(
      input,
      { evidence: item.evidence },
      resolve(item.root, "collision"),
      () => {},
      async () => {
        throw new Error("LLM must not run after a collision");
      },
    );
    expect(collision.error).toContain("Duplicate criterion ID");
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test("code rejudging changes the active score without executing the candidate again", async () => {
  const item = await fixture(
    'export default ({response}) => ({scores:{answer:response.text === "READY"}});',
  );
  try {
    const definition = await loadBenchmark(item.root);
    const runtime = {
      imageId: "test",
      candidateHash: "test",
      judgeHash: "test",
    };
    using results = new Results(resolve(item.root, "runner.db"));
    const time = new Date().toISOString();
    const benchmark: BenchmarkRun = {
      id: "benchmark_test",
      name: "Code fixture",
      source: item.root,
      createdAt: time,
      updatedAt: time,
      state: "completed",
      scheduledSlotIds: [],
      definition,
      runtime,
      execution: { startedAt: time, estimatedUSD: 0, spentUSD: 0, deferred: 0 },
    };
    results.saveBenchmark(benchmark);
    const slot = planBenchmark(definition, runtime, results)[0].slot;
    const candidate = results.startEval(slot, {
      evalId: slot.evalId,
      model: slot.model,
      repetition: 1,
      prompt: "Return READY.",
      candidateHash: slot.candidateHash,
      sourceHash: definition.evals[0].sourceHash,
      imageId: "test",
      timeoutMs: 1000,
      earlyStop: false,
      runtime,
    });
    const recorded = {
      ...candidate,
      state: "completed" as const,
      completedAt: time,
      elapsedMs: 0,
      evidence: item.evidence,
    };
    results.finishEval(recorded);
    const first = await judgeEvalRun(
      { directory: item.root, definition, runtime, results },
      recorded,
    );
    expect(first.state).toBe("completed");
    expect(first.judgment?.value).toBe(1);
    await Bun.write(
      resolve(item.directory, "judge.ts"),
      "export default () => ({scores:{answer:0.25}});",
    );
    const [second] = await judgeRuns(item.root, [candidate.id]);
    const after = readBenchmarkRun(item.root);
    expect(after.evals).toEqual([recorded]);
    expect(after.judges).toHaveLength(2);
    expect(after.judges[0]).toEqual(first);
    expect(second.judgment?.value).toBe(0.25);
    expect(after.slots[0].judgeRunId).toBe(second.id);
    expect(after.benchmark.state).toBe("completed");
    expect(
      benchmarkScores(after.benchmark.definition, after.slots, after.judges)[0]
        .percentage,
    ).toBe(25);
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});
