import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Badge } from "@opencode/ui/badge";
import { Icon } from "@opencode/ui/icon";
import { Select } from "@opencode/ui/select";
import { ProviderIcon } from "@opencode/ui/provider-icon";
import { Tooltip } from "@opencode/ui/tooltip";
import { sumCosts, stageRuntime, runtimeClock } from "@hona/openeval/view";
import type { ActivityRun, LiveEvalRun, StageState } from "../types";
import {
  duration,
  formatCost,
  formatDate,
  modelName,
  provider,
  stateLabel,
} from "../model";
import { activityProgress, estimateDuration } from "../progress";
import { LiveEvalRunTrace } from "./live-trace";
import { SessionDrawer } from "./session-drawer";
import { EvalName, topSecret } from "../privacy";

export type StageKind = "eval" | "judge";
/** Tick geometry in CSS pixels; the strip fits as many ticks as its width allows. */
const STRIP_TICK = 2;
const STRIP_GAP = 2;
const STRIP_HEIGHT = 9;
type Column = "queued" | "in_progress" | "completed" | "attention";
type Card = {
  key: string;
  group: ActivityRun;
  run: LiveEvalRun;
  kind: StageKind;
  stage: StageState;
};

/** Which column a stage card belongs to. Unknown judgments are not completions. */
export const columnOf = (card: Pick<Card, "kind" | "stage">): Column => {
  if (["queued", "waiting", "watching"].includes(card.stage.status))
    return "queued";
  if (card.stage.status === "in_progress") return "in_progress";
  if (card.stage.status === "completed" || card.stage.status === "stopped")
    return card.kind === "judge" && card.stage.score === null
      ? "attention"
      : "completed";
  return "attention";
};
export const verdict = (stage: StageState) =>
  stage.score === 1
    ? "Pass"
    : stage.score === 0
      ? "Fail"
      : typeof stage.score === "number"
        ? `${Math.round(stage.score * 100)}%`
        : "Unknown";
const dot = (card: Pick<Card, "kind" | "stage">) =>
  card.kind === "judge" && card.stage.score === null
    ? "unknown"
    : card.stage.status;

export function Activity(props: {
  runs: ActivityRun[];
  run: string;
  evalRun: string;
  stage: StageKind;
  onSelect: (run: string, evalRun: string, stage?: StageKind) => void;
}) {
  const [group, setGroup] = createSignal("");
  const [now, setNow] = createSignal(Date.now());
  onMount(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => clearInterval(timer));
  });
  const groups = createMemo(() => [
    ...new Set(props.runs.map((run) => run.benchmarkId)),
  ]);
  const selected = createMemo(() =>
    props.runs.find((run) => run.id === props.run),
  );
  createEffect(() => {
    if (selected()) setGroup(selected()!.benchmarkId);
    else if (!group() && groups().length) setGroup(groups()[0]);
  });
  const groupRuns = createMemo(() =>
    props.runs
      .filter((run) => run.benchmarkId === group())
      .toSorted((a, b) => a.state.evalOrder - b.state.evalOrder),
  );
  const progress = createMemo(() => activityProgress(groupRuns(), now()));
  const cost = createMemo(() => sumCosts(groupRuns().map((run) => run.cost)));
  const rows = createMemo(() =>
    groupRuns().flatMap((group) =>
      group.state.runs.map((run) => ({
        key: `${group.id}:${run.id}`,
        group,
        run,
      })),
    ),
  );
  // Every slot shows both stages. A judge waits in the queue until its eval run ends.
  const cards = createMemo<Card[]>(() =>
    rows().flatMap(({ key, group, run }) => [
      { key: `${key}:eval`, group, run, kind: "eval", stage: run.eval },
      { key: `${key}:judge`, group, run, kind: "judge", stage: run.judge },
    ]),
  );
  const columns: Array<{ id: Column; label: string; dot: string }> = [
    { id: "queued", label: "Queued", dot: "queued" },
    { id: "in_progress", label: "In progress", dot: "in_progress" },
    { id: "completed", label: "Completed", dot: "completed" },
    { id: "attention", label: "Needs attention", dot: "failed" },
  ];
  const columnKeys = (column: Column) =>
    cards()
      .filter((card) => columnOf(card) === column)
      .map((card) => card.key);
  const readyCount = () =>
    cards().filter(
      (card) => card.run.scheduled && card.stage.status === "queued",
    ).length;
  const waitingCount = () =>
    cards().filter(
      (card) =>
        card.run.scheduled &&
        ["waiting", "watching"].includes(card.stage.status),
    ).length;
  const deferredCount = () =>
    cards().filter(
      (card) =>
        card.run.scheduled === false &&
        ["queued", "waiting", "watching"].includes(card.stage.status),
    ).length;
  // A stacked strip of ticks. Sizes are whole device pixels so every tick and gap
  // paints identically at fractional display scaling; the width decides how many fit.
  const [metrics, setMetrics] = createSignal({
    width: 0,
    tick: STRIP_TICK,
    gap: STRIP_GAP,
    height: STRIP_HEIGHT,
  });
  const observeStrip = (element: HTMLDivElement) => {
    const measure = () => {
      const scale = window.devicePixelRatio || 1;
      const snap = (px: number) => Math.max(1, Math.round(px * scale)) / scale;
      setMetrics({
        width: element.getBoundingClientRect().width,
        tick: snap(STRIP_TICK),
        gap: snap(STRIP_GAP),
        height: snap(STRIP_HEIGHT),
      });
    };
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width !== metrics().width) measure();
    });
    observer.observe(element);
    // Zoom and display changes alter the scale without always resizing the strip.
    window.addEventListener("resize", measure);
    onCleanup(() => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    });
  };
  const strip = createMemo(() => {
    const order: Column[] = ["completed", "attention", "in_progress", "queued"];
    const sorted = cards()
      .map((card) => columnOf(card))
      .sort((a, b) => order.indexOf(a) - order.indexOf(b));
    if (!sorted.length) return [];
    const { width, tick, gap } = metrics();
    const fit = Math.floor((width + gap) / (tick + gap));
    const segments = Math.max(1, fit || sorted.length);
    return Array.from({ length: segments }, (_, index) => {
      const start = Math.floor((index * sorted.length) / segments),
        end = Math.max(
          start + 1,
          Math.floor(((index + 1) * sorted.length) / segments),
        );
      const counts = new Map<Column, number>();
      for (const column of sorted.slice(start, end))
        counts.set(column, (counts.get(column) ?? 0) + 1);
      const [column] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        column,
        title: [...counts.entries()]
          .map(
            ([column, count]) =>
              `${count} ${columns.find((item) => item.id === column)!.label.toLowerCase()}`,
          )
          .join(", "),
      };
    });
  });
  const current = () =>
    selected()?.state.runs.find((run) => run.id === props.evalRun);
  return (
    <div class="activity-page">
      <header class="activity-heading">
        <h1>Eval run queue</h1>
        <Show when={groups().length}>
          <Select
            aria-label="Benchmark run"
            options={groups()}
            current={group()}
            label={(id) =>
              `Benchmark · ${formatDate(props.runs.find((run) => run.benchmarkId === id)!.state.startedAt)}`
            }
            onSelect={(id) => {
              if (id && id !== group()) {
                props.onSelect("", "");
                setGroup(id);
              }
            }}
          />
        </Show>
      </header>
      <Show when={rows().length}>
        <div class="queue-timing">
          <Tooltip value="Free workers immediately start ready work. Judges wait for finalized eval evidence.">
            <span class="queue-workers">
              Workers{" "}
              <strong>
                {progress().active}/{progress().concurrency}
              </strong>
            </span>
          </Tooltip>
          <Tooltip
            value={`Estimated from ${progress().samples} completed eval/judge stage runtimes for the current execution scope, using ${progress().concurrency} parallel workers. Idle gaps and deferred work are excluded.`}
          >
            <span class="queue-eta">
              <span>{progress().running ? "ETA" : "Run ended"}</span>
              <strong>
                {progress().remainingMs !== null
                  ? `About ${estimateDuration(progress().remainingMs!)} left`
                  : progress().running
                    ? "Estimating…"
                    : `${progress().finished}/${progress().total} finished`}
              </strong>
            </span>
          </Tooltip>
          <Show when={progress().finishAt !== null}>
            <span>
              Est. finish{" "}
              <strong>
                {new Date(progress().finishAt!).toLocaleString([], {
                  ...(new Date(progress().finishAt!).toDateString() !==
                  new Date(now()).toDateString()
                    ? { month: "short" as const, day: "numeric" as const }
                    : {}),
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </strong>
            </span>
          </Show>
          <Tooltip value="Recorded eval and judge wall-clock runtime across all executions. Overlapping workers count once; idle gaps and passive monitoring are excluded.">
            <span>
              Elapsed <strong>{duration(progress().elapsedMs)}</strong>
            </span>
          </Tooltip>
          <Tooltip value="Reported eval and judge cost, including active-session usage and previous executions.">
            <span>
              Cost so far <strong>{formatCost(cost().reportedUSD)}</strong>
            </span>
          </Tooltip>
        </div>
        <div
          class="queue-strip"
          ref={observeStrip}
          style={{
            "--strip-tick": `${metrics().tick}px`,
            "--strip-gap": `${metrics().gap}px`,
            "--strip-height": `${metrics().height}px`,
          }}
          aria-label={`${progress().evals} of ${progress().total} eval runs done, ${progress().scored} scored`}
        >
          <For each={strip()}>
            {(segment) => <span class={segment.column} title={segment.title} />}
          </For>
        </div>
        <details class="model-race" open>
          <summary>
            <span>Model progress</span>
            <small class="progress-summary">
              <span>
                <strong>{progress().evals}</strong>/{progress().total} eval runs
                done
              </span>
              <span>
                <strong>{progress().scored}</strong>/{progress().total} scored
              </span>
              <Show when={progress().attention}>
                <span class="progress-attention">
                  <strong>{progress().attention}</strong> need attention
                </span>
              </Show>
            </small>
          </summary>
          <div class="model-race-grid">
            <For each={progress().models.map((model) => model.key)}>
              {(key) => {
                const model = () =>
                  progress().models.find((model) => model.key === key)!;
                return (
                  <div class="model-race-row">
                    <ProviderIcon id={provider(model().model)} />
                    <div class="model-race-lane">
                      <div class="model-race-label">
                        <span class="model-race-name">
                          <strong>{modelName(model().model)}</strong>
                          <small>{model().reasoning}</small>
                        </span>
                        <span class="model-race-count">
                          <small>
                            {model().active
                              ? `${model().active} running`
                              : model().stopped
                                ? `${model().stopped} stopped`
                                : model().completed + model().attention ===
                                    model().total
                                  ? "Done"
                                  : model().scheduled
                                    ? "Queued"
                                    : "Not scheduled"}
                          </small>
                          <Tooltip
                            value={`${model().completed} of ${model().total} eval and judge stages completed${model().attention ? `, ${model().attention} need attention` : ""}`}
                          >
                            <span>
                              {model().completed}/{model().total}
                            </span>
                          </Tooltip>
                        </span>
                      </div>
                      <div
                        class="model-race-track"
                        role="progressbar"
                        aria-label={`${modelName(model().model)} · ${model().reasoning} completed stages`}
                        aria-valuemin={0}
                        aria-valuemax={model().total}
                        aria-valuenow={model().completed}
                      >
                        <span
                          style={{
                            width: `${(model().completed / model().total) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </details>
      </Show>
      <div class="activity-workspace">
        <div class="queue-board" aria-label="Eval and judge status columns">
          <For each={columns}>
            {(column) => (
              <section
                class="queue-column"
                aria-labelledby={`queue-${column.id}`}
              >
                <header class="queue-column-heading">
                  <span class={`status-dot ${column.dot}`} aria-hidden="true" />
                  <h2 id={`queue-${column.id}`}>{column.label}</h2>
                  <Badge>
                    {column.id === "queued"
                      ? `${readyCount()} ready`
                      : columnKeys(column.id).length}
                  </Badge>
                  <Show when={column.id === "queued" && waitingCount()}>
                    <small
                      class="queue-waiting-count"
                      title="Judges waiting for finalized eval evidence"
                    >
                      {waitingCount()} waiting
                    </small>
                  </Show>
                  <Show when={column.id === "queued" && deferredCount()}>
                    <small class="queue-waiting-count">
                      {deferredCount()} not scheduled
                    </small>
                  </Show>
                </header>
                <div
                  class="queue-column-list"
                  role="region"
                  aria-label={`${column.label} eval and judge runs`}
                  tabIndex={0}
                >
                  <For each={columnKeys(column.id)}>
                    {(key) => {
                      const card = () =>
                        cards().find((card) => card.key === key)!;
                      const active = () =>
                        props.run === card().group.id &&
                        props.evalRun === card().run.id &&
                        props.stage === card().kind;
                      const elapsed = () =>
                        stageRuntime(
                          card().stage,
                          runtimeClock(
                            now(),
                            card().group.state.heartbeatAt,
                            card().group.state.status === "running",
                          ),
                        );
                      const evalLabel = () =>
                        topSecret() ? "Hidden eval" : card().group.state.eval;
                      const outcome = () =>
                        card().run.scheduled === false &&
                        ["queued", "waiting", "watching"].includes(
                          card().stage.status,
                        )
                          ? "Not scheduled"
                          : card().kind === "judge" &&
                              card().stage.status === "completed"
                            ? verdict(card().stage)
                            : card().stage.status === "waiting"
                              ? "Waiting for eval run"
                              : card().stage.status === "blocked"
                                ? "Blocked by eval run"
                                : stateLabel(card().stage.status);
                      return (
                        <button
                          class="queue-card"
                          data-run-key={key}
                          data-stage={card().kind}
                          data-state={card().stage.status}
                          classList={{ selected: active() }}
                          aria-pressed={active()}
                          disabled={topSecret()}
                          aria-label={`${card().kind === "eval" ? "Eval run" : "Judge"}, ${modelName(card().run.model)}, ${card().run.reasoning}, ${evalLabel()}, run ${card().run.repetition}, ${outcome()}`}
                          onClick={() => {
                            if (!topSecret())
                              props.onSelect(
                                card().group.id,
                                card().run.id,
                                card().kind,
                              );
                          }}
                        >
                          <span class="queue-card-heading">
                            <span
                              class={`status-dot ${dot(card())}`}
                              aria-hidden="true"
                            />
                            <strong>{modelName(card().run.model)}</strong>
                            <small>{card().run.reasoning}</small>
                            <span
                              class="stage-icon"
                              data-stage={card().kind}
                              title={`${card().kind === "eval" ? "Eval run" : "Judge"} · ${outcome()}`}
                              aria-label={
                                card().kind === "eval" ? "Eval run" : "Judge"
                              }
                              role="img"
                            >
                              <Icon
                                name={
                                  card().kind === "eval" ? "flask" : "shield"
                                }
                              />
                            </span>
                          </span>
                          <span class="queue-card-meta">
                            <EvalName>{card().group.state.eval}</EvalName>
                            <span class="queue-card-numbers">
                              <Show
                                when={
                                  card().kind === "eval" &&
                                  card().stage.status === "stopped"
                                }
                              >
                                <span
                                  class="early-stop-label"
                                  title={`Stopped after judge check through evidence event ${card().run.stop?.checkpoint.through ?? ""}`}
                                >
                                  Stopped early
                                </span>
                              </Show>
                              <Show
                                when={
                                  card().stage.status === "in_progress" &&
                                  elapsed() !== undefined
                                }
                              >
                                <time class="queue-card-elapsed">
                                  {duration(elapsed()!)}
                                </time>
                              </Show>
                              <Show
                                when={
                                  card().kind === "judge" &&
                                  card().stage.status === "completed"
                                }
                              >
                                <span
                                  class={`verdict ${verdict(card().stage).toLowerCase()}`}
                                >
                                  {verdict(card().stage)}
                                </span>
                              </Show>
                              <span>#{card().run.repetition}</span>
                            </span>
                          </span>
                        </button>
                      );
                    }}
                  </For>
                  <Show when={!columnKeys(column.id).length}>
                    <p class="queue-column-empty">
                      {column.id === "attention"
                        ? "Nothing needs attention"
                        : "No eval or judge runs"}
                    </p>
                  </Show>
                </div>
              </section>
            )}
          </For>
        </div>
        <Show when={!topSecret() && current()}>
          <SessionDrawer
            open
            title={`${modelName(current()!.model)} ${props.stage === "judge" ? "judge" : "eval run"}`}
            onClose={() => props.onSelect("", "")}
          >
            <LiveEvalRunTrace
              run={selected()!}
              selected={current()!}
              stage={props.stage}
              onBack={() => props.onSelect("", "")}
            />
          </SessionDrawer>
        </Show>
      </div>
    </div>
  );
}
