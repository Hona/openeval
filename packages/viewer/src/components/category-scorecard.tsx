import { For, Show } from "solid-js";
import { ProviderIcon } from "@opencode/ui/provider-icon";
import { modelName, provider, reasoning } from "../model";
import { isRange, scorecardValue, type Scorecard } from "../scorecard";
import { criteriaCount, LOW_COVERAGE } from "./category-filter";

/** One benchmark down the left, its categories as rows, and models as columns. */
export function CategoryScorecard(props: { benchmark: string; card: Scorecard }) {
  return (
    <div class="category-matrix-scroll">
      <table class="category-scorecard">
        <thead>
          <tr>
            <th scope="col">Benchmark</th>
            <th scope="col">Category</th>
            <For each={props.card.models}>
              {(model) => (
                <th scope="col" class="scorecard-model">
                  <span class="provider-mark">
                    <ProviderIcon id={provider(model)} />
                  </span>
                  <strong>{modelName(model)}</strong>
                  <small>{reasoning(model)}</small>
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={props.card.rows}>
            {(row, index) => (
              <tr classList={{ "scorecard-overall": row.overall }}>
                <Show when={index() === 0}>
                  <th
                    scope="rowgroup"
                    rowSpan={props.card.rows.length}
                    class="scorecard-benchmark"
                  >
                    {props.benchmark}
                  </th>
                </Show>
                <th scope="row" class="scorecard-category">
                  <span>{row.name}</span>
                  <small
                    classList={{
                      low: !row.overall && row.criteria < LOW_COVERAGE,
                    }}
                  >
                    {criteriaCount(row.criteria)} · {row.evals} eval
                    {row.evals === 1 ? "" : "s"}
                  </small>
                </th>
                <For each={row.cells}>
                  {(cell) => (
                    <td
                      class="category-cell"
                      classList={{
                        overall: row.overall,
                        range: isRange(cell.bounds),
                        leader: cell.leader,
                      }}
                      style={{ "--score": `${cell.bounds.lower}%` }}
                    >
                      {scorecardValue(cell.bounds)}
                      <Show when={cell.leader}>
                        <span class="sr-only">, highest</span>
                      </Show>
                    </td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
