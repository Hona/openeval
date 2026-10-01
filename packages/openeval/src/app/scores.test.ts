import { expect, test } from "bun:test";
import type { BenchmarkDefinition, JudgeRun, Slot } from "../types";
import { benchmarkScores } from "./scores";

const code = (hash: string) => ({ file: "judge.ts", hash, source: "", sourceMap: "", dependencies: {} });
const definition: BenchmarkDefinition = {
  name: "Fixture",
  directory: "/benchmark",
  models: ["local/model"],
  repetitions: 3,
  concurrency: 1,
  candidate: { timeoutMs: 1000, websearch: false },
  judge: { timeoutMs: 1000, websearch: false },
  container: { engine: "docker", image: "fixture", cpus: 1, memoryMiB: 1024 },
  evals: [
    {
      id: "delivery",
      name: "Delivery",
      directory: "/benchmark/evals/delivery",
      prompt: "Deliver the change.",
      judge: "",
      judgeHash: "judge",
      sourceHash: "workspace",
      settings: {},
      criteria: [],
      codeCriteria: [{ id: "works", name: "Works" }],
      code: code("current"),
    },
  ],
};
const slots: Slot[] = [1, 2, 3].map((repetition) => ({
  id: `delivery:local/model:${repetition}`,
  evalId: "delivery",
  model: "local/model",
  repetition,
  candidateHash: "candidate",
  judgeHash: "judge",
  active: true,
  evalRunId: `eval_${repetition}`,
  judgeRunId: repetition === 1 ? "judge_1" : null,
}));
const judged = (hash: string) =>
  [
    {
      id: "judge_1",
      input: { code: code(hash) },
      state: "completed",
      code: { state: "completed" },
      judgment: {
        value: 1,
        reason: "Works.",
        scores: { works: { value: 1, reason: "Works.", evidence: [], source: "judge.ts" } },
      },
    },
  ] as unknown as JudgeRun[];

test("declared judge.ts criteria bound partly judged repetitions", () => {
  const [score] = benchmarkScores(definition, slots, judged("current"));
  expect(score.unscoredEvals).toEqual([]);
  expect(score.percentage).toBeNull();
  expect(score.bounds.lower).toBeCloseTo(100 / 3);
  expect(score.bounds.upper).toBe(100);
});

test("a judgment from an older judge.ts no longer counts", () => {
  expect(benchmarkScores(definition, slots, judged("previous"))[0].bounds).toMatchObject({
    lower: 0,
    upper: 100,
  });
});

test("undeclared code criteria keep the eval unresolved until every repetition is judged", () => {
  const undeclared = {
    ...definition,
    evals: [{ ...definition.evals[0], codeCriteria: undefined }],
  };
  expect(benchmarkScores(undeclared, slots, judged("current"))[0].unscoredEvals).toEqual([
    "delivery",
  ]);
});
