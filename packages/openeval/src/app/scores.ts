import type { BenchmarkDefinition, JudgeRun, Slot } from "../types";
import type { CodeJudgeDefinition } from "../judge-context";
import { modelScore } from "../view";
import { isScored } from "../judgment";
import { categoryKey, inCategories } from "../criterion-categories";
import { recordedCodeMatches } from "../infra/judging/code-source";

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
  const matches = new WeakMap<CodeJudgeDefinition, WeakMap<CodeJudgeDefinition, boolean>>();
  const equivalent = (expected: CodeJudgeDefinition, recorded: CodeJudgeDefinition | undefined) => {
    if (!recorded) return false;
    let previous = matches.get(expected);
    if (!previous) { previous = new WeakMap(); matches.set(expected, previous); }
    const cached = previous.get(recorded);
    if (cached !== undefined) return cached;
    const value = recordedCodeMatches(expected, recorded);
    previous.set(recorded, value);
    return value;
  };
  // A code judgment counts only after completed verification of the matching executable.
  const current = (item: (typeof evals)[number], slot: Slot) => {
    const judge = slot.judgeRunId ? index.get(slot.judgeRunId) : undefined;
    return !item.code ||
      (judge?.code?.state === "completed" &&
         equivalent(item.code, judge.input.code))
      ? judge
      : undefined;
  };
  const keys = definition.categories?.map(categoryKey);
  const definitions = new Map(
    evals.map((item) => {
      const criteria = new Map(
        [...item.criteria, ...(item.codeCriteria ?? [])].map((criterion) => [
          criterion.id,
          criterion,
        ]),
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
      const categorized = [...criteria.values()].map((criterion) => ({
        ...criterion,
        categories: item.categories?.[criterion.id] ?? [],
      }));
      return [
        item.id,
        keys
          ? categorized.filter((criterion) => inCategories(criterion, keys))
          : categorized,
      ];
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
                current(item, slot)?.judgment?.scores?.[criterion.id]?.value,
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
            ...(criterion.categories.length
              ? { categories: criterion.categories }
              : {}),
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
      // Without a declared `criteria` export, judge.ts reveals its criteria only by running.
      evals
        .filter(
          (item) =>
            item.code &&
            !item.codeCriteria?.length &&
            slots.some(
              (slot) =>
                slot.active &&
                slot.evalId === item.id &&
                slot.model === model &&
                !current(item, slot),
            ),
        )
        .map((item) => item.id),
    ),
  );
}
