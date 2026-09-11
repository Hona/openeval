import type { BenchmarkDefinition, JudgeRun, Slot } from "../types";
import { modelScore } from "../view";

/** Scores are derived from a single selection snapshot; every eval has equal weight. */
export function benchmarkScores(
  definition: BenchmarkDefinition,
  slots: readonly Slot[],
  judges: readonly JudgeRun[],
  evalId?: string,
) {
  const index = new Map(judges.map((run) => [run.id, run]));
  return definition.models.map((model) =>
    modelScore(
      model,
      definition.evals
        .filter((item) => !evalId || item.id === evalId)
        .flatMap((item) => {
          const metrics = item.metrics;
          const selected = slots.filter(
            (slot) =>
              slot.active && slot.evalId === item.id && slot.model === model,
          );
          return metrics.map((metric) => {
            const values = selected
              .map(
                (slot) =>
                  (slot.judgeRunId
                    ? index.get(slot.judgeRunId)?.judgment?.metrics
                    : undefined
                  )?.find((value) => value.id === metric.id)?.value,
              )
              .filter((value): value is 0 | 1 => value === 0 || value === 1);
            const scoredSum = values.reduce<number>(
              (sum, value) => sum + value,
              0,
            );
            return {
              eval: item.id,
              metric: metric.id,
              name: metric.name,
              value:
                values.length === definition.repetitions
                  ? scoredSum / definition.repetitions
                  : null,
              scored: values.length,
              expected: definition.repetitions,
              passed: scoredSum,
              scoredSum,
            };
          });
        }),
    ),
  );
}
