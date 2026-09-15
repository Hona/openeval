import type { ViewerOverview } from "@hona/openeval/view";
import { duration, formatRecordedCost } from "../../viewer/src/model";
import recording from "./recording/overview.json";

/** The homepage, Markdown, and full viewer all project this reviewed recording. */
export const recorded = recording as ViewerOverview;
export type Sample = { model: string };
export const samples: Sample[] = recorded.summary.overview.scores.map(
  ({ model }) => ({ model }),
);
export const repetitions = recorded.repetitions;
export const evals = Object.fromEntries(
  Object.entries(recorded.evals).map(([id, summary]) => [
    id,
    [
      ...new Map(
        summary.overview.scores.flatMap((score) =>
          score.components.map(
            (part) =>
              [
                part.criterion,
                { criterion: part.criterion, name: part.name },
              ] as const,
          ),
        ),
      ).values(),
    ],
  ]),
);
export const resultViews = [
  { id: "benchmark", label: "Benchmark" },
  ...Object.keys(evals).map((id) => ({ id, label: id })),
];
export const resultsDescription = `Recorded demo · ${Object.keys(evals).length} evals · ${samples.length} models · ${repetitions} repetitions`;

export const exampleScores = (view = "benchmark") => [
  ...(view === "benchmark" ? recorded.summary : recorded.evals[view]).overview
    .scores,
];

const observed = (
  value: number | null | undefined,
  format: (value: number) => string = String,
) => (value == null ? "Unavailable" : format(value));

export const exampleMetrics = (sample: Sample) => {
  const metrics = recorded.metrics.find((item) => item.model === sample.model)!;
  return [
    { label: "Cost", value: formatRecordedCost(metrics.cost) },
    { label: "Tool calls", value: observed(metrics.toolCalls) },
    {
      label: "Input",
      value: observed(
        metrics.inputTokens,
        (value) => `${Math.round(value / 1000)}k tokens`,
      ),
    },
    { label: "Duration", value: observed(metrics.durationMs, duration) },
  ];
};
