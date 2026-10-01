import { createMemo, createSignal, For } from "solid-js";
import { ProviderIcon } from "@opencode/ui/provider-icon";
import {
  scoreBounds,
  selectCategories,
  type CategorySummary,
  type ModelScore,
  type ScoreBounds,
} from "@hona/openeval/view";
import { formatNumber, modelName, provider, reasoning } from "../model";
import { criteriaCount, LOW_COVERAGE } from "./category-filter";

const OVERALL = "";
const cell = (bounds: ScoreBounds) =>
  bounds.upper - bounds.lower > 0.000001
    ? `${formatNumber(bounds.lower)}–${formatNumber(bounds.upper)}`
    : formatNumber(bounds.lower);

/** Every model × category, sortable, with the selected-criteria score first. */
export function CategoryMatrix(props: {
  categories: CategorySummary[];
  scores: ModelScore[];
  onCategory?: (key: string) => void;
}) {
  const [sort, setSort] = createSignal(OVERALL);
  const rows = createMemo(() =>
    props.scores.map((score) => ({
      score,
      overall: scoreBounds(score),
      categories: new Map(
        props.categories.map((category) => [
          category.key,
          scoreBounds(selectCategories(score, [category.key])),
        ]),
      ),
    })),
  );
  const value = (row: ReturnType<typeof rows>[number], key: string) =>
    key === OVERALL ? row.overall : row.categories.get(key)!;
  const sorted = () =>
    [...rows()].sort(
      (a, b) => value(b, sort()).lower - value(a, sort()).lower,
    );
  const heading = (key: string, name: string) => (
    <button
      class="category-sort"
      classList={{ active: sort() === key }}
      aria-sort={sort() === key ? "descending" : undefined}
      onClick={() => setSort(key)}
    >
      {name}
    </button>
  );
  return (
    <div class="category-matrix-scroll">
      <table class="category-matrix">
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">{heading(OVERALL, "Score")}</th>
            <For each={props.categories}>
              {(category) => (
                <th
                  scope="col"
                  title={`${criteriaCount(category.criteria)} in ${category.evals} eval${category.evals === 1 ? "" : "s"}${category.criteria < LOW_COVERAGE ? " · low coverage" : ""}`}
                >
                  {heading(category.key, category.name)}
                  <small classList={{ low: category.criteria < LOW_COVERAGE }}>
                    {criteriaCount(category.criteria)}
                  </small>
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={sorted()}>
            {(row) => (
              <tr>
                <th scope="row">
                  <span class="model-identity">
                    <span class="provider-mark">
                      <ProviderIcon id={provider(row.score.model)} />
                    </span>
                    <span>
                      <strong>{modelName(row.score.model)}</strong>
                      <small>{reasoning(row.score.model)}</small>
                    </span>
                  </span>
                </th>
                <td class="category-cell overall">
                  <span>{cell(row.overall)}</span>
                </td>
                <For each={props.categories}>
                  {(category) => {
                    const bounds = () => row.categories.get(category.key)!;
                    return (
                      <td
                        class="category-cell"
                        classList={{
                          range: bounds().upper > bounds().lower + 0.000001,
                        }}
                        style={{ "--score": `${bounds().lower}%` }}
                      >
                        <button
                          disabled={!props.onCategory}
                          onClick={() => props.onCategory?.(category.key)}
                          aria-label={`${modelName(row.score.model)}, ${category.name}: ${cell(bounds())}%${props.onCategory ? ", show ranking" : ""}`}
                        >
                          {cell(bounds())}
                        </button>
                      </td>
                    );
                  }}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
