import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { BenchmarkRun, ModelRef } from "../types";
import { Results } from "../infra/sqlite";
import { JUDGE_AGENT } from "../infra/judging/agent";
import { JUDGE_PROTOCOL } from "../judgment";
import { loadBenchmark } from "./load-benchmark";
import { planBenchmark } from "./plan-benchmark";
import { recordEvidence } from "./judge-evidence";
import { readBenchmarkRun, readEvidence } from "./read-run";
import { removeModels } from "./remove-models";

const models: ModelRef[] = [
  "example/keep",
  "example/remove-failed",
  "example/remove-scored",
];
const runtime: BenchmarkRun["runtime"] = {
  imageId: "image",
  candidateHash: "candidate-runtime",
  judgeHash: "judge-runtime",
};
const writeSource = (root: string, selected: readonly ModelRef[]) =>
  Bun.write(
    resolve(root, "benchmark.ts"),
    "export default " +
      JSON.stringify({
        models: selected,
        judge: { model: "example/judge", websearch: false },
        candidate: { websearch: false },
        repetitions: 1,
      }),
  );

async function fixture() {
  const root = await mkdtemp(
    resolve(
      process.platform === "win32" ? "C:/tmp/opencode" : tmpdir(),
      "openeval-remove-models-",
    ),
  );
  await writeSource(root, models);
  await Bun.write(
    resolve(root, "evals/answer/prompt.md"),
    "Answer the question.",
  );
  await Bun.write(
    resolve(root, "evals/answer/judge.md"),
    "## Criterion: correct — Correct answer\nPass when correct.",
  );
  const definition = await loadBenchmark(root);
  const item = definition.evals[0];
  using results = new Results(resolve(root, "runner.db"));
  results.saveBenchmark(
    {
      id: "fixture",
      name: "Model removal fixture",
      source: root,
      definition,
      runtime,
      state: "failed",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      scheduledSlotIds: [],
      execution: {
        startedAt: "2026-01-01T00:00:00.000Z",
        estimatedUSD: 0,
        spentUSD: 0,
        deferred: 0,
      },
    },
    true,
  );
  for (const { slot } of planBenchmark(definition, runtime, results)) {
    const candidate = results.startEval(slot, {
      evalId: item.id,
      model: slot.model,
      repetition: 1,
      prompt: item.prompt,
      candidateHash: slot.candidateHash,
      sourceHash: item.sourceHash,
      imageId: runtime.imageId,
      timeoutMs: definition.candidate.timeoutMs,
      earlyStop: false,
      runtime,
    });
    const evidence = await recordEvidence({
      directory: resolve(root, candidate.id, "evidence"),
      prompt: item.prompt,
      response: "The answer is present.",
    });
    const failed = slot.model === models[1];
    results.finishEval({
      ...candidate,
      state: failed ? "failed" : "completed",
      completedAt: candidate.startedAt,
      elapsedMs: 0,
      evidence,
      ...(failed ? { error: "Provider unavailable" } : {}),
    });
    if (failed) continue;
    const judge = results.startJudge({
      evalRunId: candidate.id,
      evidence,
      rubric: item.judge,
      kind: "llm",
      agent: JUDGE_AGENT,
      model: definition.judge.model,
      judgeHash: slot.judgeHash,
      timeoutMs: definition.judge.timeoutMs,
      websearch: false,
      mode: "final",
      runtimeHash: runtime.judgeHash,
      criteria: item.criteria,
      protocol: JUDGE_PROTOCOL,
    });
    results.finishJudge({
      ...judge,
      state: "completed",
      completedAt: judge.startedAt,
      elapsedMs: 0,
      judgment: {
        value: 1,
        reason: "The answer is present.",
        scores: {
          correct: {
            value: 1,
            reason: "The answer is present.",
            evidence: [{ kind: "response" }],
            source: "judge.md",
          },
        },
      },
    });
  }
  return root;
}

test("removes active models while preserving completed and failed records and evidence", async () => {
  const root = await fixture();
  try {
    const before = readBenchmarkRun(root);
    await writeSource(root, [models[0]]);
    const result = await removeModels(root, models.slice(1));
    const after = readBenchmarkRun(root);
    expect(result.retiredSlots).toBe(2);
    expect(after.benchmark.id).toBe(before.benchmark.id);
    expect(after.benchmark.state).toBe("completed");
    expect(after.benchmark.definition.models).toEqual([models[0]]);
    expect(after.evals).toEqual(before.evals);
    expect(after.judges).toEqual(before.judges);
    expect(after.slots.filter((slot) => slot.active)).toEqual(
      before.slots.filter((slot) => slot.model === models[0]),
    );
    for (const previous of before.slots.filter(
      (slot) => slot.model !== models[0],
    ))
      expect(after.slots.find((slot) => slot.id === previous.id)).toEqual({
        ...previous,
        active: false,
      });
    for (const candidate of after.evals) {
      const evidence = await readEvidence(candidate.evidence!);
      expect((await evidence.query({ action: "response" })).text).toBe(
        "The answer is present.",
      );
    }
    using results = new Results(resolve(root, "runner.db"), true);
    expect(results.revisions()).toHaveLength(2);
    expect(
      planBenchmark(after.benchmark.definition, runtime, results).map(
        (item) => item.action,
      ),
    ).toEqual(["reuse"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("can retire models when the original declaration is no longer available", async () => {
  const root = await fixture();
  try {
    await rm(resolve(root, "benchmark.ts"));
    const result = await removeModels(root, models.slice(1));
    expect(result.benchmark.state).toBe("completed");
    expect(result.benchmark.definition.models).toEqual([models[0]]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test.each(["empty-selection", "running", "unknown-model", "all-models"])(
  "rejects %s removal without changing records",
  async (scenario) => {
    const root = await fixture();
    try {
      let removed = models.slice(1);
      if (scenario === "empty-selection") removed = [];
      if (scenario === "unknown-model") removed.push("example/unknown");
      if (scenario === "all-models") removed = models;
      if (scenario === "running") {
        using results = new Results(resolve(root, "runner.db"));
        results.saveBenchmark({ ...results.benchmark!, state: "running" });
      }
      const before = readBenchmarkRun(root);
      await expect(removeModels(root, removed)).rejects.toThrow();
      expect(readBenchmarkRun(root)).toEqual(before);
      using results = new Results(resolve(root, "runner.db"), true);
      expect(results.revisions()).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
