import type { CriterionDefinition, CriterionScore } from "./types";

export const JUDGE_PROTOCOL = 4;
export const isScored = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;

/** The author declares Markdown criteria; code functions return their own scores. */
export function rubricCriteria(rubric: string): CriterionDefinition[] {
  if (/^## Metric:/m.test(rubric))
    throw new Error("Use ## Criterion: id — Label for rubric declarations");
  const criteria = [
    ...rubric.matchAll(
      /^## Criterion: ([a-z][a-z0-9_]*)[ \t]*[—–-][ \t]*(.+)$/gm,
    ),
  ].map((match) => ({
    id: match[1],
    name: match[2].trim(),
  }));
  if (
    new Set(criteria.map((criterion) => criterion.id)).size !== criteria.length
  )
    throw new Error("Criterion IDs must be unique within judge.md");
  if (
    !criteria.length ||
    criteria.some((criterion) => !criterion.name) ||
    criteria.length !== (rubric.match(/^## Criterion:/gm)?.length ?? 0)
  )
    throw new Error(
      "Declare every criterion as ## Criterion: id — Label in judge.md",
    );
  return criteria;
}

/** Equal weighting within an eval; no task-specific policy is implemented here.
 * https://arxiv.org/html/2607.07946#S5.SS3 (equal task weighting)
 */
export function criterionMean(
  scores: Readonly<Record<string, Pick<CriterionScore, "value">>>,
): number | null {
  const criteria = Object.values(scores);
  return criteria.length &&
    criteria.every((criterion) => isScored(criterion.value))
    ? criteria.reduce((sum, criterion) => sum + criterion.value!, 0) /
        criteria.length
    : null;
}
