import { modelScore } from "@hona/openeval/view";
import { duration, formatCost } from "../../viewer/src/model";
import comparison from "./benchmark";

export type Sample = {
  model: (typeof comparison.models)[number];
  passes: Record<string, number>;
  costUSD?: number;
  toolCalls?: number;
  contextTokens?: number;
  durationMs?: number;
};

export const evals = {
  "ask-dialect": [
    { criterion: "asked_dialect", name: "Asks for the SQL dialect" },
    { criterion: "safe_parameters", name: "Uses bound parameters" },
  ],
  "exact-answer": [{ criterion: "correct_answer", name: "Correct answer" }],
};
export const repetitions = comparison.repetitions;
// Example outcomes reproduce the author's reported model percentages.
// Big Pickle's outcome is an illustration, not a collected result.
export const samples: Sample[] = [
  {
    model: comparison.models[0],
    passes: { asked_dialect: 8, safe_parameters: 9, correct_answer: 8 },
    costUSD: 0.91,
    toolCalls: 14,
    contextTokens: 41_200,
    durationMs: 312_000,
  },
  {
    model: comparison.models[1],
    passes: { asked_dialect: 7, safe_parameters: 8, correct_answer: 6 },
    costUSD: 1.34,
    toolCalls: 18,
    contextTokens: 52_400,
    durationMs: 401_000,
  },
  {
    model: comparison.models[2],
    passes: { asked_dialect: 4, safe_parameters: 4, correct_answer: 4 },
    costUSD: 0.22,
    toolCalls: 9,
    contextTokens: 28_100,
    durationMs: 148_000,
  },
  {
    model: comparison.models[3],
    passes: { asked_dialect: 6, safe_parameters: 7, correct_answer: 6 },
    costUSD: 0.18,
    toolCalls: 22,
    contextTokens: 61_000,
    durationMs: 530_000,
  },
  {
    model: comparison.models[4],
    passes: { asked_dialect: 5, safe_parameters: 5, correct_answer: 5 },
    costUSD: 0.05,
    toolCalls: 11,
    contextTokens: 33_000,
    durationMs: 205_000,
  },
  {
    model: comparison.models[5],
    passes: { asked_dialect: 7, safe_parameters: 7, correct_answer: 6 },
  },
];

export const resultViews = [
  { id: "benchmark", label: "Benchmark" },
  ...Object.keys(evals).map((id) => ({ id, label: id })),
];
export const resultsDescription = `Example data · ${Object.keys(evals).length} evals · ${samples.length} models · ${repetitions} repetitions`;

export const exampleScores = (view = "benchmark") =>
  samples.map((sample) =>
    modelScore(
      sample.model,
      Object.entries(evals)
        .filter(([id]) => view === "benchmark" || id === view)
        .flatMap(([id, criteria]) =>
          criteria.map((item) => {
            const passed = sample.passes[item.criterion];
            return {
              eval: id,
              ...item,
              value: passed / repetitions,
              scored: repetitions,
              expected: repetitions,
              passed,
              scoredSum: passed,
            };
          }),
        ),
    ),
  );

const observed = (
  value: number | undefined,
  format: (value: number) => string = String,
) => (value === undefined ? "Not run" : format(value));

export const exampleMetrics = (sample: Sample) => [
  { label: "Cost", value: observed(sample.costUSD, formatCost) },
  { label: "Tool calls", value: observed(sample.toolCalls) },
  {
    label: "Context",
    value: observed(
      sample.contextTokens,
      (value) => `${Math.round(value / 1000)}k tokens`,
    ),
  },
  { label: "Duration", value: observed(sample.durationMs, duration) },
];
