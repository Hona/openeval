import { For, Show } from "solid-js";
import { ProviderIcon } from "@opencode/ui/provider-icon";
import { Icon } from "@opencode/ui/icon";
import { modelScore, scoreBounds, type ModelScore } from "@hona/openeval/view";
import {
  formatNumber,
  formatPercent,
  modelName,
  provider,
  reasoning,
} from "../model";

export function ScoreChart(props: {
  scores: ModelScore[];
  public?: boolean;
  incomplete?: boolean;
  criteria?: boolean;
  onSelect?: (model: string) => void;
}) {
  const sorted = () =>
    [...props.scores].sort(
      (a, b) => scoreBounds(b).lower - scoreBounds(a).lower,
    );
  const outcomes = (score: ModelScore) => {
    const expected = score.components.reduce(
      (sum, part) => sum + part.expected,
      0,
    );
    const scored = score.components.reduce((sum, part) => sum + part.scored, 0);
    if (!expected) return "";
    if (new Set(score.components.map((part) => part.eval)).size > 1)
      return `${scored}/${expected} checks scored`;
    if (
      scored === expected &&
      score.components.every((part) => part.passed !== undefined)
    )
      return `${score.components.reduce((sum, part) => sum + part.passed!, 0)}/${expected} passed`;
    const passed = score.components.every((part) => part.passed !== undefined)
      ? `${score.components.reduce((sum, part) => sum + part.passed!, 0)} passed · `
      : "";
    return `${passed}${scored}/${expected} scored`;
  };
  const label = (score: ModelScore) => {
    const bounds = scoreBounds(score);
    return bounds.upper - bounds.lower > 0.000001
      ? `${formatNumber(bounds.lower)}–${formatPercent(bounds.upper)}`
      : formatPercent(bounds.lower);
  };
  return (
    <div
      class="score-chart"
      role="group"
      aria-label="Model scores from zero to one hundred percent"
    >
      <div class="chart-scale">
        <span>Model</span>
        <div>
          <For each={[0, 25, 50, 75, 100]}>
            {(tick) => <span>{tick}%</span>}
          </For>
        </div>
        <span>Score</span>
      </div>
      <For each={sorted()}>
        {(score) => (
          <div class="chart-model">
            <button
              class="chart-row"
              data-run-key={`chart:${score.model}`}
              classList={{ inspectable: !!props.onSelect }}
              disabled={!props.onSelect}
              onClick={() => props.onSelect?.(score.model)}
              aria-label={`${modelName(score.model)}, ${label(score)}${!props.public ? `, ${outcomes(score)}` : ""}${props.onSelect ? ", inspect eval run" : ""}`}
              title={`Earned ${formatPercent(scoreBounds(score).lower)}. Possible final score ${label(score)}.`}
            >
              <div class="model-identity">
                <span class="provider-mark">
                  <ProviderIcon id={provider(score.model)} />
                </span>
                <div>
                  <strong>{modelName(score.model)}</strong>
                  <small>{reasoning(score.model)}</small>
                </div>
              </div>
              <div class="chart-track" aria-hidden="true">
                <div class="chart-grid">
                  <For each={[0, 25, 50, 75, 100]}>
                    {(tick) => <i style={{ left: `${tick}%` }} />}
                  </For>
                </div>
                <div
                  class="chart-bar"
                  style={{ width: `${scoreBounds(score).lower}%` }}
                />
                <Show
                  when={
                    scoreBounds(score).upper >
                    scoreBounds(score).lower + 0.000001
                  }
                >
                  <div
                    class="chart-range"
                    style={{
                      left: `${scoreBounds(score).lower}%`,
                      width: `${scoreBounds(score).upper - scoreBounds(score).lower}%`,
                    }}
                  />
                </Show>
                <Show when={!props.public}>
                  <span class="chart-points">{outcomes(score)}</span>
                </Show>
              </div>
              <div
                class="chart-score"
                classList={{ range: score.percentage === null }}
              >
                <span>{label(score)}</span>
                <Show when={props.onSelect}>
                  <Icon name="chevron-right" />
                </Show>
              </div>
            </button>
            <Show when={props.criteria && score.components.length > 1}>
              <For each={score.components}>
                {(part) => {
                  const criterion = () => modelScore(score.model, [part]);
                  return (
                    <button
                      class="chart-row criterion-row"
                      disabled={!props.onSelect}
                      onClick={() => props.onSelect?.(score.model)}
                      aria-label={`${modelName(score.model)}, ${part.name ?? part.criterion}, ${label(criterion())}`}
                    >
                      <span class="criterion-name">
                        {part.name ?? part.criterion}
                      </span>
                      <div class="chart-track" aria-hidden="true">
                        <div
                          class="chart-bar"
                          style={{
                            width: `${scoreBounds(criterion()).lower}%`,
                          }}
                        />
                        <span class="chart-points">
                          {part.scored === part.expected
                            ? `${part.passed}/${part.expected} passed`
                            : `${part.scored}/${part.expected} scored`}
                        </span>
                      </div>
                      <span class="criterion-score">{label(criterion())}</span>
                    </button>
                  );
                }}
              </For>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}
