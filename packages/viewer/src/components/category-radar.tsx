import { createMemo, createSignal, For, Show } from "solid-js";
import { Button } from "@opencode/ui/button";
import { Checkbox } from "@opencode/ui/checkbox";
import {
  scoreBounds,
  selectCategories,
  type CategorySummary,
  type ModelScore,
  type ScoreBounds,
} from "@hona/openeval/view";
import { formatNumber, formatPercent, modelName, reasoning } from "../model";
import { criteriaCount, LOW_COVERAGE } from "./category-filter";

/** State colours from the active theme, in legend order. */
export const SERIES = [
  "var(--app-success)",
  "var(--v2-state-fg-info, #6aa6ff)",
  "var(--v2-state-fg-warning, #f0b45e)",
  "var(--app-danger)",
];
const MAX_SERIES = SERIES.length;
const SIZE = { width: 580, height: 450, radius: 150, labelGap: 20 };

const ranged = (bounds: ScoreBounds) => bounds.upper - bounds.lower > 0.000001;
const label = (bounds: ScoreBounds) =>
  ranged(bounds)
    ? `${formatNumber(bounds.lower)}–${formatPercent(bounds.upper)}`
    : formatPercent(bounds.lower);
const compact = (bounds: ScoreBounds) =>
  ranged(bounds)
    ? `${Math.round(bounds.lower)}–${Math.round(bounds.upper)}%`
    : `${Math.round(bounds.lower)}%`;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

type Series = {
  id: string;
  label: string;
  color: string;
  dashed?: boolean;
  values: ScoreBounds[];
};

export function CategoryRadar(props: {
  categories: CategorySummary[];
  scores: ModelScore[];
}) {
  const ranked = createMemo(() =>
    [...props.scores].sort(
      (a, b) => scoreBounds(b).lower - scoreBounds(a).lower,
    ),
  );
  const [chosen, setChosen] = createSignal<string[]>();
  const [mode, setMode] = createSignal<"compare" | "median">("compare");
  const order = () =>
    (chosen() ?? ranked().map((score) => score.model))
      .filter((model) => props.scores.some((score) => score.model === model))
      .slice(0, MAX_SERIES);
  const picked = () => order().slice(0, mode() === "median" ? 1 : MAX_SERIES);
  const focus = (model: string) =>
    setChosen([model, ...order().filter((item) => item !== model)]);
  const perCategory = (score: ModelScore) =>
    props.categories.map((category) =>
      scoreBounds(selectCategories(score, [category.key])),
    );
  const series = createMemo<Series[]>(() => {
    const rows = picked().map((model, index) => {
      const score = props.scores.find((item) => item.model === model)!;
      return {
        id: model,
        label: modelName(model),
        color: SERIES[index]!,
        values: perCategory(score),
      };
    });
    if (mode() !== "median") return rows;
    const field = props.scores.map(perCategory);
    return [
      {
        id: "median",
        label: "Field median",
        color: "var(--app-muted)",
        dashed: true,
        values: props.categories.map((_, axis) => {
          const value = median(field.map((values) => values[axis]!.lower));
          return { lower: value, upper: value, coverage: 100 };
        }),
      },
      ...rows,
    ];
  });
  const toggle = (model: string, checked: boolean) => {
    const current = order();
    setChosen(
      checked
        ? [...current.filter((item) => item !== model), model].slice(
            -MAX_SERIES,
          )
        : current.filter((item) => item !== model),
    );
  };
  const angle = (axis: number) =>
    -Math.PI / 2 + (2 * Math.PI * axis) / props.categories.length;
  const point = (axis: number, value: number, gap = 0) => {
    const distance =
      (SIZE.radius * Math.max(0, Math.min(100, value))) / 100 + gap;
    return [
      SIZE.width / 2 + Math.cos(angle(axis)) * distance,
      SIZE.height / 2 + Math.sin(angle(axis)) * distance,
    ] as const;
  };
  const polygon = (values: number[]) =>
    values.map((value, axis) => point(axis, value).join(",")).join(" ");
  const anchor = (axis: number) => {
    const x = Math.cos(angle(axis));
    return Math.abs(x) < 0.25 ? "middle" : x > 0 ? "start" : "end";
  };
  /** Top labels sit above their vertex, bottom labels below, side labels centred. */
  const labelY = (axis: number) => {
    const y = Math.sin(angle(axis)),
      base = point(axis, 100, SIZE.labelGap)[1];
    return y < -0.25 ? base - 14 : y > 0.25 ? base + 4 : base - 6;
  };
  return (
    <div class="category-radar">
      <div class="category-radar-chart">
        <div class="category-radar-modes" role="group" aria-label="Radar mode">
          <Button
            size="small"
            variant={mode() === "compare" ? "neutral" : "ghost-muted"}
            aria-pressed={mode() === "compare"}
            onClick={() => setMode("compare")}
          >
            Compare models
          </Button>
          <Button
            size="small"
            variant={mode() === "median" ? "neutral" : "ghost-muted"}
            aria-pressed={mode() === "median"}
            onClick={() => setMode("median")}
          >
            Model vs field median
          </Button>
        </div>
        <Show
          when={props.categories.length >= 3}
          fallback={
            <div class="category-bars">
              <p>Select three or more categories for a radar chart.</p>
              <For each={props.categories}>
                {(category, axis) => (
                  <div class="category-bar-group">
                    <span>{category.name}</span>
                    <For each={series()}>
                      {(row) => (
                        <div
                          class="category-bar"
                          title={`${row.label} · ${category.name}: ${label(row.values[axis()]!)}`}
                        >
                          <i
                            style={{
                              width: `${row.values[axis()]!.lower}%`,
                              background: row.color,
                            }}
                          />
                          <small>{label(row.values[axis()]!)}</small>
                        </div>
                      )}
                    </For>
                  </div>
                )}
              </For>
            </div>
          }
        >
          <svg
            viewBox={`0 0 ${SIZE.width} ${SIZE.height}`}
            role="img"
            aria-label={`Category scores for ${series()
              .map((row) => row.label)
              .join(", ")}`}
          >
            <For each={[25, 50, 75, 100]}>
              {(ring) => (
                <polygon
                  class="radar-ring"
                  points={polygon(props.categories.map(() => ring))}
                />
              )}
            </For>
            <For each={[50, 100]}>
              {(ring) => {
                const [x, y] = point(0, ring);
                return (
                  <text class="radar-tick" x={x + 5} y={y + 11}>
                    {ring}
                  </text>
                );
              }}
            </For>
            <For each={props.categories}>
              {(category, axis) => {
                const end = () => point(axis(), 100);
                const place = () => [
                  point(axis(), 100, SIZE.labelGap)[0],
                  labelY(axis()),
                ];
                const low = category.criteria < LOW_COVERAGE;
                return (
                  <g>
                    <line
                      class="radar-axis"
                      classList={{ low }}
                      x1={SIZE.width / 2}
                      y1={SIZE.height / 2}
                      x2={end()[0]}
                      y2={end()[1]}
                    />
                    <text
                      class="radar-label"
                      x={place()[0]}
                      y={place()[1]}
                      text-anchor={anchor(axis())}
                    >
                      {category.name}
                      <tspan
                        class="radar-coverage"
                        classList={{ low }}
                        x={place()[0]}
                        dy="15"
                        text-anchor={anchor(axis())}
                      >
                        {criteriaCount(category.criteria)}
                      </tspan>
                    </text>
                  </g>
                );
              }}
            </For>
            <For each={series()}>
              {(row) => (
                <g class="radar-series" style={{ "--series": row.color }}>
                  <Show
                    when={row.values.some(
                      (value) => value.upper > value.lower + 0.000001,
                    )}
                  >
                    <polygon
                      class="radar-upper"
                      points={polygon(row.values.map((value) => value.upper))}
                    />
                  </Show>
                  <polygon
                    class="radar-area"
                    classList={{ dashed: row.dashed }}
                    points={polygon(row.values.map((value) => value.lower))}
                  />
                  <For each={row.values}>
                    {(value, axis) => {
                      const [x, y] = point(axis(), value.lower);
                      return (
                        <circle class="radar-point" cx={x} cy={y} r="4">
                          <title>
                            {`${row.label} · ${props.categories[axis()]!.name}: ${label(value)}`}
                          </title>
                        </circle>
                      );
                    }}
                  </For>
                </g>
              )}
            </For>
          </svg>
        </Show>
        <p class="category-radar-note">
          Solid areas show earned points. Dashed outlines show the possible
          range for unscored checks. Dashed axes and amber counts mark low
          coverage: fewer than {LOW_COVERAGE} criteria.
        </p>
      </div>
      <div class="category-radar-models">
        <span class="category-radar-heading">
          {mode() === "median" ? "Pick a model" : `Pick up to ${MAX_SERIES} models`}
        </span>
        <For each={ranked()}>
          {(score) => {
            const index = () => picked().indexOf(score.model);
            return (
              <div class="category-radar-model">
                <Checkbox
                  checked={index() >= 0}
                  onChange={(checked) =>
                    mode() === "median"
                      ? checked && focus(score.model)
                      : toggle(score.model, checked)
                  }
                >
                  <span
                    class="category-swatch"
                    style={{
                      background:
                        index() >= 0
                          ? SERIES[mode() === "median" ? 0 : index()]
                          : "transparent",
                    }}
                  />
                  <span class="category-radar-name">
                    {modelName(score.model)}
                    <small>{reasoning(score.model)}</small>
                  </span>
                </Checkbox>
                <span
                  class="category-radar-score"
                  title={label(scoreBounds(score))}
                >
                  {compact(scoreBounds(score))}
                </span>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}
