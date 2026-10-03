import { expect, test } from "bun:test";
import type { BenchmarkDefinition, BenchmarkRun, JudgeRunInput } from "../types";
import { JUDGE_PROTOCOL } from "../judgment";
import { JUDGE_AGENT } from "../infra/judging/agent";
import {
  candidateFingerprint,
  candidateProviders,
  candidateTimeout,
  judgeFingerprint,
  savedJudgeFingerprint,
} from "./input-fingerprints";

const definition: BenchmarkDefinition = {
  name: "SDK fixture",
  directory: "/benchmark",
  models: ["gateway/listed#high", "gateway/custom#high"],
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
      judge: "",
      judgeHash: "rubric",
      sourceHash: "workspace",
      settings: {},
      criteria: [],
    },
  ],
};
const runtime: BenchmarkRun["runtime"] = {
  imageId: "fixture-image",
  candidateHash: "candidate-runtime",
  judgeHash: "judge-runtime",
};
const custom = { name: "Custom", limit: { context: 1000, output: 100 } };
const withProviders = (
  providers: BenchmarkDefinition["candidate"]["providers"],
): BenchmarkDefinition => ({
  ...definition,
  candidate: { ...definition.candidate, providers },
});
const hash = (value: BenchmarkDefinition, model: "listed" | "custom") =>
  candidateFingerprint(value, "answer", `gateway/${model}#high`, runtime);

test("another model's provider override leaves a candidate's inputs unchanged", () => {
  const configured = withProviders({ gateway: { models: { custom } } });

  expect(hash(configured, "listed")).toBe(hash(definition, "listed"));
  expect(hash(withProviders({ gateway: {} }), "listed")).toBe(
    hash(definition, "listed"),
  );
  expect(
    candidateProviders(configured.candidate.providers, "gateway/listed#high"),
  ).toBeUndefined();
});

test("a candidate receives and fingerprints only its own provider configuration", () => {
  const providers = {
    gateway: { env: ["GATEWAY_KEY"], models: { custom, other: custom } },
    unrelated: { env: ["UNRELATED_KEY"] },
  } satisfies BenchmarkDefinition["candidate"]["providers"];

  expect(candidateProviders(providers, "gateway/custom#high")).toEqual({
    gateway: { env: ["GATEWAY_KEY"], models: { custom } },
  });
  expect(candidateProviders(providers, "gateway/listed#high")).toEqual({
    gateway: { env: ["GATEWAY_KEY"] },
  });
  expect(hash(withProviders(providers), "listed")).not.toBe(
    hash(definition, "listed"),
  );
  expect(
    hash(
      withProviders({
        ...providers,
        gateway: { ...providers!.gateway, models: { custom } },
      }),
      "custom",
    ),
  ).toBe(hash(withProviders(providers), "custom"));
});

const markdown: BenchmarkDefinition = {
  ...definition,
  evals: [
    {
      ...definition.evals[0],
      judge:
        "## Criterion: answer — Answer\nPass if the response supplies the fact.",
      criteria: [{ id: "answer", name: "Answer" }],
    },
  ],
};
const verifier = (imageId: string) => ({
  engine: "docker" as const,
  image: "openeval-verification:0.5.0",
  imageId: `sha256:${imageId.repeat(64)}`,
  cpus: 2,
  memoryMiB: 4096,
});
const verified = (
  value: BenchmarkDefinition,
  imageId: string,
): BenchmarkDefinition => ({
  ...value,
  judge: { ...value.judge, verification: verifier(imageId) },
});
const coded = (value: BenchmarkDefinition): BenchmarkDefinition => ({
  ...value,
  evals: value.evals.map((item) => ({
    ...item,
    code: {
      file: "judge.ts",
      hash: "judge-code",
      source: "",
      sourceMap: "",
      dependencies: {},
    },
  })),
});
const savedInput = (value: BenchmarkDefinition): JudgeRunInput => {
  const item = value.evals[0];
  return {
    evalRunId: "eval",
    evidence: { directory: "evidence", hash: "recording" },
    rubric: item.judge,
    agent: JUDGE_AGENT,
    model: value.judge.model,
    kind: item.code ? "hybrid" : "llm",
    code: item.code,
    verification: value.judge.verification as JudgeRunInput["verification"],
    judgeHash: "pending",
    timeoutMs: value.judge.timeoutMs,
    websearch: value.judge.websearch,
    mode: "final",
    runtimeHash: runtime.judgeHash,
    criteria: item.criteria,
    protocol: JUDGE_PROTOCOL,
  };
};

test("verification capacity changes code judgments, not candidate or Markdown identities", () => {
  const original = verified(markdown, "a");
  const enlarged = {
    ...original,
    judge: { ...original.judge, verification: { ...verifier("a"), workspaceMiB: 2048 } },
  };
  expect(hash(enlarged, "listed")).toBe(hash(original, "listed"));
  expect(judgeFingerprint(enlarged, "answer")).toBe(judgeFingerprint(original, "answer"));
  expect(judgeFingerprint(coded(enlarged), "answer")).not.toBe(judgeFingerprint(coded(original), "answer"));
});

// Recorded with the released 0.4.0 package. Upgrading must not reschedule unchanged work.
const RELEASED = {
  candidate: "ecd1b6f52dab74671b6349d28f93ead4dde48ac31fbca8bd3201516a6fbf7e4e",
  judge: "5488546a4229f7bcbcb29c537cf17daee30b3f416f2bea132cbd44951b7f31d8",
};

test("unchanged evals keep their released identities after an upgrade", () => {
  const upgraded = verified(
    {
      ...markdown,
      evals: [{ ...markdown.evals[0], settings: { earlyStop: true } }],
    },
    "a",
  );

  expect(hash(markdown, "listed")).toBe(RELEASED.candidate);
  expect(hash(upgraded, "listed")).toBe(RELEASED.candidate);
  expect(judgeFingerprint(markdown, "answer")).toBe(RELEASED.judge);
  expect(judgeFingerprint(upgraded, "answer")).toBe(RELEASED.judge);
});

test("an eval time limit changes only that eval's candidate identity", () => {
  const limited = (timeoutMs?: number): BenchmarkDefinition => ({
    ...definition,
    evals: [
      {
        ...definition.evals[0],
        settings: timeoutMs ? { candidate: { timeoutMs } } : {},
      },
      { ...definition.evals[0], id: "explain" },
    ],
  });
  const identity = (value: BenchmarkDefinition, evalId: string) =>
    candidateFingerprint(value, evalId, "gateway/listed#high", runtime);
  const eightHours = 8 * 60 * 60_000;

  // No override, or one equal to benchmark.candidate.timeoutMs, keeps the released identity.
  expect(identity(limited(), "answer")).toBe(RELEASED.candidate);
  expect(identity(limited(1000), "answer")).toBe(RELEASED.candidate);
  expect(candidateTimeout(limited(eightHours), "answer")).toBe(eightHours);
  expect(candidateTimeout(limited(eightHours), "explain")).toBe(1000);
  expect(identity(limited(eightHours), "answer")).not.toBe(RELEASED.candidate);
  expect(identity(limited(eightHours), "explain")).toBe(
    identity(limited(), "explain"),
  );
});

test("the verification runtime changes code judgments only", () => {
  expect(judgeFingerprint(verified(markdown, "a"), "answer")).toBe(
    judgeFingerprint(verified(markdown, "b"), "answer"),
  );
  expect(judgeFingerprint(verified(coded(markdown), "a"), "answer")).not.toBe(
    judgeFingerprint(verified(coded(markdown), "b"), "answer"),
  );
  const codeOnly = coded({
    ...markdown,
    evals: [{ ...markdown.evals[0], judge: "", criteria: [] }],
  });
  expect(judgeFingerprint(verified(codeOnly, "a"), "answer")).not.toBe(
    judgeFingerprint(verified(codeOnly, "b"), "answer"),
  );
});

test("saved judge inputs reproduce the planned identity", () => {
  for (const value of [verified(markdown, "a"), verified(coded(markdown), "a")])
    expect(savedJudgeFingerprint(savedInput(value))).toBe(
      judgeFingerprint(value, "answer"),
    );
});
