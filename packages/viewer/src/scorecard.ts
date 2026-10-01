import {
  scoreBounds,
  selectCategories,
  type CategorySummary,
  type ModelScore,
  type ScoreBounds,
} from "@hona/openeval/view";

const EPSILON = 0.000001;

export type ScorecardCell = {
  model: string;
  bounds: ScoreBounds;
  leader: boolean;
};
export type ScorecardRow = {
  key: string;
  name: string;
  criteria: number;
  evals: number;
  overall: boolean;
  cells: ScorecardCell[];
};
export type Scorecard = { models: string[]; rows: ScorecardRow[] };

export const isRange = (bounds: ScoreBounds) =>
  bounds.upper - bounds.lower > EPSILON;

/** One decimal, as in published benchmark tables; unresolved checks stay a range. */
export const scorecardValue = (bounds: ScoreBounds) =>
  isRange(bounds)
    ? `${bounds.lower.toFixed(1)}–${bounds.upper.toFixed(1)}%`
    : `${bounds.lower.toFixed(1)}%`;

/** A lead counts only when no unresolved range can overtake it. Ties share it. */
export function leaders(bounds: readonly ScoreBounds[]) {
  const marked = bounds.map(
    (value, index) =>
      bounds.length > 1 &&
      bounds.every(
        (other, peer) => peer === index || value.lower + EPSILON >= other.upper,
      ),
  );
  return marked.every(Boolean) ? marked.map(() => false) : marked;
}

/** One benchmark: its overall score, then each category; models ordered by overall score. */
export function scorecard(
  scores: readonly ModelScore[],
  categories: readonly CategorySummary[],
  overall = "Overall",
): Scorecard {
  const models = [...scores].sort(
    (a, b) =>
      scoreBounds(b).lower - scoreBounds(a).lower ||
      scoreBounds(b).upper - scoreBounds(a).upper,
  );
  const row = (
    entry: Omit<ScorecardRow, "cells">,
    pick: (score: ModelScore) => ModelScore,
  ): ScorecardRow => {
    const bounds = models.map((score) => scoreBounds(pick(score)));
    const lead = leaders(bounds);
    return {
      ...entry,
      cells: models.map((score, index) => ({
        model: score.model,
        bounds: bounds[index],
        leader: lead[index],
      })),
    };
  };
  const components = models[0]?.components ?? [];
  return {
    models: models.map((score) => score.model),
    rows: [
      row(
        {
          key: "",
          name: overall,
          criteria: components.length,
          evals: new Set(components.map((part) => part.eval)).size,
          overall: true,
        },
        (score) => score,
      ),
      ...categories.map((category) =>
        row(
          {
            key: category.key,
            name: category.name,
            criteria: category.criteria,
            evals: category.evals,
            overall: false,
          },
          (score) => selectCategories(score, [category.key]),
        ),
      ),
    ],
  };
}
