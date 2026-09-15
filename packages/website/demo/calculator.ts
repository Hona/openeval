import { modelScore, type ModelScore } from "@hona/openeval/view";

export type Decision = 0 | 1 | null;

export const calculator = {
  title: "Score explorer",
  description: "Illustration · one repetition per criterion",
  scoreLabel: "Benchmark score",
  hint: "Select a decision to cycle through pass → fail → unknown. The calculation uses OpenEval's score projection.",
  href: "/docs/scoring/#try-it",
  criteria: [
    {
      eval: "sql",
      evalName: "SQL query",
      criterion: "asked_dialect",
      name: "Asks for dialect",
    },
    {
      eval: "sql",
      evalName: "SQL query",
      criterion: "safe_parameters",
      name: "Bound parameters",
    },
    {
      eval: "summary",
      evalName: "Issue summary",
      criterion: "actionable",
      name: "Actionable summary",
    },
  ],
  values: [1, 0, 1] as Decision[],
};

export const calculatorScore = (
  values: readonly Decision[] = calculator.values,
) =>
  modelScore(
    "example",
    calculator.criteria.map((criterion, index) => ({
      ...criterion,
      value: values[index],
      expected: 1,
      scored: values[index] === null ? 0 : 1,
      passed: values[index] ?? 0,
      scoredSum: values[index] ?? 0,
    })),
  );

export const decisionLabel = (value: Decision) =>
  value === null ? "Unknown" : value ? "Pass" : "Fail";
export const calculatorLabel = (score: ModelScore) =>
  score.percentage === null
    ? `${score.bounds.lower.toFixed(0)}–${score.bounds.upper.toFixed(0)}%`
    : `${score.percentage.toFixed(0)}%`;
export const calculatorStatus = (score: ModelScore) =>
  score.percentage === null ? "Waiting on unknowns" : "Equal eval weights";
