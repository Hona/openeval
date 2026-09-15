import type { BenchmarkDefinition, JudgeRun, Slot } from "../types";
import { modelScore } from "../view";
import { isScored } from "../judgment";

/** Scores are derived from a single selection snapshot; every eval has equal weight. */
export function benchmarkScores(
  definition: BenchmarkDefinition,
  slots: readonly Slot[],
  judges: readonly JudgeRun[],
  evalId?: string,
) {
  const index = new Map(judges.map((run) => [run.id, run]));
  const evals = definition.evals.filter(
    (item) => !evalId || item.id === evalId,
  );
  const definitions = new Map(
    evals.map((item) => {
      const criteria = new Map(
        item.criteria.map((criterion) => [criterion.id, criterion]),
      );
      for (const slot of slots.filter(
        (slot) => slot.active && slot.evalId === item.id,
      )) {
        const judgment = slot.judgeRunId
          ? index.get(slot.judgeRunId)?.judgment
          : undefined;
        for (const id of Object.keys(judgment?.scores ?? {}))
          if (!criteria.has(id))
            criteria.set(id, { id, name: id.replaceAll("_", " ") });
      }
      return [item.id, [...criteria.values()]];
    }),
  );
  return definition.models.map((model) =>
    modelScore(
      model,
      evals.flatMap((item) => {
        const criteria = definitions.get(item.id)!;
        const selected = slots.filter(
          (slot) =>
            slot.active && slot.evalId === item.id && slot.model === model,
        );
        return criteria.map((criterion) => {
          const values = selected
            .map(
              (slot) =>
                (slot.judgeRunId
                  ? index.get(slot.judgeRunId)?.judgment?.scores
                  : undefined)?.[criterion.id]?.value,
            )
            .filter(isScored);
          const scoredSum = values.reduce<number>(
            (sum, value) => sum + value,
            0,
          );
          return {
            eval: item.id,
            criterion: criterion.id,
            name: criterion.name,
            value:
              values.length === definition.repetitions
                ? scoredSum / definition.repetitions
                : null,
            scored: values.length,
            expected: definition.repetitions,
            passed: values.filter((value) => value === 1).length,
            scoredSum,
          };
        });
      }),
      evals.map((item) => item.id),
      evals
        .filter(
          (item) =>
            item.code &&
            slots
              .filter(
                (slot) =>
                  slot.active &&
                  slot.evalId === item.id &&
                  slot.model === model,
              )
              .some((slot) => {
                const judge = slot.judgeRunId
                  ? index.get(slot.judgeRunId)
                  : undefined;
                return (
                  judge?.code?.state !== "completed" ||
                  judge.input.code?.hash !== item.code!.hash
                );
              }),
        )
        .map((item) => item.id),
    ),
  );
}
