import { formatPercent, modelName, reasoning } from "../../viewer/src/model";
import {
  evals,
  exampleMetrics,
  exampleScores,
  resultViews,
  resultsDescription,
  samples,
} from "../demo/results";
import type { Block, Section } from "./content";
import { codeJudge, codePrompt, prompt, rubric } from "./examples";

export const guideActions = {
  agent: { label: "Agent prompt", href: "/agent-start.md" },
  human: { label: "Human quick start", href: "/docs/quickstart/" },
  demo: { label: "Demo", href: "/demo/" },
};
export const guideSteps = [
  "Task",
  "Judge",
  "Run",
  "Inspect",
  "Compare",
] as const;
export type GuideStep = (typeof guideSteps)[number];
export const guideStepId = (step: GuideStep) => `guide-${step.toLowerCase()}`;

const code = (file: string, code: string, language: string) =>
  ({ type: "code", file, code, language }) satisfies Block;

export const guideExamples = {
  "judge.md": {
    prompt: code("evals/ask-dialect/prompt.md", prompt, "markdown"),
    judge: code("evals/ask-dialect/judge.md", rubric, "markdown"),
  },
  "judge.ts": {
    prompt: code("evals/exact-answer/prompt.md", codePrompt, "markdown"),
    judge: code("evals/exact-answer/judge.ts", codeJudge, "typescript"),
  },
};
export type GuideJudge = keyof typeof guideExamples;
export const guideJudgeFiles = Object.keys(guideExamples) as GuideJudge[];
export const guideRun = code(
  "terminal",
  "bunx --bun @hona/openeval run",
  "shell",
);
export const guideComparison = (source: string) =>
  code("benchmark.ts", source, "typescript");

/** A text projection of the same tabs, scores, and metrics used by ResultsCard. */
export function resultsBlocks(): Block[] {
  return [
    { type: "text", text: resultsDescription },
    ...resultViews.flatMap(({ id, label }): Block[] => {
      const scores = exampleScores(id).sort(
        (a, b) => b.bounds.lower - a.bounds.lower,
      );
      const criteria =
        id === "benchmark" ? [] : evals[id as keyof typeof evals];
      return [
        { type: "text", text: label },
        {
          type: "table",
          columns: [
            "Model",
            "Thinking",
            "Score",
            ...criteria.map((criterion) => criterion.name),
          ],
          rows: scores.map((score) => [
            modelName(score.model),
            reasoning(score.model),
            formatPercent(score.percentage),
            ...criteria.map((criterion) => {
              const component = score.components.find(
                (part) => part.criterion === criterion.criterion,
              )!;
              return `${component.passed}/${component.expected}`;
            }),
          ]),
        },
      ];
    }),
    {
      type: "table",
      columns: [
        "Model",
        ...exampleMetrics(samples[0]).map((metric) => metric.label),
      ],
      rows: samples.map((sample) => [
        modelName(sample.model),
        ...exampleMetrics(sample).map((metric) => metric.value),
      ]),
    },
  ];
}

export function overviewSections(comparisonSource: string): Section[] {
  const blocks: Record<GuideStep, Block[]> = {
    Task: guideJudgeFiles.map((file) => guideExamples[file].prompt),
    Judge: guideJudgeFiles.map((file) => guideExamples[file].judge),
    Run: [guideRun],
    Inspect: resultsBlocks(),
    Compare: [guideComparison(comparisonSource)],
  };
  return guideSteps.map((step, index) => ({
    id: guideStepId(step),
    title: `${index + 1}. ${step}`,
    blocks: blocks[step],
  }));
}
