import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  on,
  Show,
} from "solid-js";
import { useTheme } from "@opencode/ui/theme/context";
import { Button } from "@opencode/ui/button";
import { Badge } from "@opencode/ui/badge";
import { Icon } from "@opencode/ui/icon";
import { IconButton } from "@opencode/ui/icon-button";
import { Tooltip } from "@opencode/ui/tooltip";
import { TextInput } from "@opencode/ui/text-input";
import { Tabs } from "@opencode/ui/tabs";
import { Select } from "@opencode/ui/select";
import { ScoreChart } from "./components/score-chart";
import { EvalRunTrace } from "./components/trace";
import { SessionDrawer } from "./components/session-drawer";
import { Activity } from "./components/activity";
import { ModelFilter } from "./components/model-filter";
import { downloadResultsImage } from "./results-image";
import { EvalName, SecretToggle, topSecret, SECRET_MODE_KEY } from "./privacy";
import {
  duration,
  formatCost,
  formatDate,
  formatNumber,
  matchesModelFilters,
} from "./model";
import type {
  ActivityRun,
  ResultSummary,
  EvalRunIndex,
  ResultEntry,
  ResultIndex,
} from "./types";
import {
  scoreBounds,
  modelScore,
  runtimeMs,
  runtimeClock,
} from "@hona/openeval/view";

type Route = {
  id: string;
  view: "results" | "evals" | "activity";
  eval: string;
  run: string;
  evalRun: string;
  stage: "eval" | "judge";
  models: string;
};
const readRoute = (): Route => {
  if (history.state?.openevalRoute) return history.state.openevalRoute as Route;
  const q = new URLSearchParams(location.search);
  return {
    id: q.get("result") ?? "",
    view:
      q.get("view") === "trace"
        ? q.get("eval")
          ? "evals"
          : "results"
        : ["evals", "activity"].includes(q.get("view") ?? "")
          ? (q.get("view") as Route["view"])
          : "results",
    eval: q.get("eval") ?? "",
    run: q.get("run") ?? "",
    evalRun: q.get("evalRun") ?? "",
    stage: q.get("stage") === "judge" ? "judge" : "eval",
    models: q.get("models") ?? "",
  };
};
const get = async <T,>(path: string): Promise<T> => {
  const response = await fetch(path);
  if (!response.ok)
    throw new Error(
      (await response.json().catch(() => ({}))).error ??
        `Request failed (${response.status})`,
    );
  return response.json();
};
// Reuse the same document across page and drawer resources. A newer index stamp
// invalidates it; concurrent consumers share one request.
const results = new Map<string, ResultSummary | EvalRunIndex>();
const pendingResults = new Map<string, Promise<ResultSummary | EvalRunIndex>>();
const getResult = <T extends ResultSummary | EvalRunIndex>(
  id: string,
  format: "summary" | "runs",
  updatedAt = 0,
): T | Promise<T> => {
  const key = `${id}:${format}`;
  const cached = results.get(key) as T | undefined;
  if (cached && cached.entry.updatedAt >= updatedAt) return cached;
  const pending = pendingResults.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const request = get<T>(
    `/api/result?id=${encodeURIComponent(id)}&format=${format}`,
  )
    .then((value) => {
      results.delete(key);
      results.set(key, value);
      if (results.size > 8) results.delete(results.keys().next().value!);
      return value;
    })
    .finally(() => pendingResults.delete(key));
  pendingResults.set(key, request);
  return request;
};

function ResultTabs(props: {
  value: string;
  onChange: (value: string) => void;
}) {
  let ready = false;
  onMount(() => {
    // Kobalte registers triggers in order and can propose the first tab mid-mount.
    queueMicrotask(() => {
      ready = true;
    });
  });
  return (
    <Tabs
      variant="pill"
      value={props.value}
      class="level-tabs"
      onChange={(value) => {
        if (
          ready &&
          ["results", "evals"].includes(props.value) &&
          value !== props.value
        )
          props.onChange(value);
      }}
    >
      <Tabs.List>
        <Tabs.Trigger value="results">Benchmark results</Tabs.Trigger>
        <Tabs.Trigger value="evals">Eval breakdown</Tabs.Trigger>
      </Tabs.List>
    </Tabs>
  );
}

export function App() {
  const theme = useTheme();
  const [route, setRoute] = createSignal(readRoute());
  const [filter, setFilter] = createSignal("");
  const [sidebar, setSidebar] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [now, setNow] = createSignal(Date.now());
  onMount(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => clearInterval(clock));
  });
  const [exportingImage, setExportingImage] = createSignal(false);
  const [index, indexActions] = createResource(() =>
    get<ResultIndex>("/api/results"),
  );
  const isPublic = () => index()?.public ?? false;
  const [activity, activityActions] = createResource(
    () => index() && !index()!.public,
    () => get<ActivityRun[]>("/api/activity"),
  );
  const resultVersion = (id: string) =>
    index()?.entries.find((entry) => entry.id === id.split("~")[0])?.updatedAt;
  const loadRuns = (id: string) =>
    getResult<EvalRunIndex>(id, "runs", resultVersion(id));
  const traceOpen = () =>
    route().view !== "activity" &&
    !!route().run &&
    !!route().evalRun &&
    !isPublic() &&
    !topSecret();
  // Track the index revision in each resource source. Reading a failed resource
  // in a shared refresh effect can stop updates for the other resource too.
  const [document] = createResource(
    () =>
      !!route().id && { id: route().id, version: resultVersion(route().id) },
    ({ id, version }) => getResult<ResultSummary>(id, "summary", version),
  );
  const [traceDocument] = createResource(
    () =>
      traceOpen() &&
      !!route().run && { id: route().run, version: resultVersion(route().run) },
    ({ id, version }) => getResult<EvalRunIndex>(id, "runs", version),
  );
  const data = createMemo(() => document()?.overview);
  const traceRun = () =>
    traceDocument()?.entry.id === route().run ? traceDocument() : undefined;
  const selectedEval = createMemo(() => route().eval || data()?.evals[0] || "");
  const navigate = (next: Partial<Route>, replace = false) => {
    const value = { ...route(), ...next };
    setRoute(value);
    const q = new URLSearchParams();
    for (const [key, content] of Object.entries({
      result: topSecret() ? value.id.split("~")[0] : value.id,
      view: value.view === "results" ? "" : value.view,
      eval: topSecret() ? "" : value.eval,
      run: topSecret() ? "" : value.run,
      evalRun: topSecret() ? "" : value.evalRun,
      stage:
        !topSecret() && value.evalRun && value.stage === "judge" ? "judge" : "",
      models: value.models,
    }))
      if (content) q.set(key, content);
    history[replace ? "replaceState" : "pushState"](
      { openevalRoute: value },
      "",
      "?" + q.toString(),
    );
    setNotice("");
  };
  createEffect(
    on(topSecret, (enabled) => {
      try {
        localStorage.setItem(SECRET_MODE_KEY, String(enabled));
      } catch {}
      navigate(enabled ? { run: "", evalRun: "" } : {}, true);
    }),
  );
  const choose = (entry: ResultEntry) => {
    navigate({ id: entry.id, view: "results", eval: "", run: "", evalRun: "" });
    setSidebar(false);
  };
  const closeTrace = () =>
    navigate({
      run: "",
      evalRun: "",
    });
  createEffect(() => {
    const entries = index()?.entries;
    if (
      entries?.length &&
      !entries.some((entry) => entry.id === route().id.split("~")[0])
    ) {
      const first =
        entries.find((entry) => entry.kind === "benchmark") ?? entries[0];
      navigate({ id: first.id, run: "", evalRun: "" }, true);
    }
    if (isPublic() && route().view !== "results")
      navigate({ view: "results", eval: "", run: "", evalRun: "" }, true);
  });
  onMount(() => {
    theme.setTheme("oc-2");
    theme.setColorScheme("dark");
    const pop = () => {
      const value = readRoute();
      if (topSecret()) navigate({ ...value, run: "", evalRun: "" }, true);
      else setRoute(value);
    };
    window.addEventListener("popstate", pop);
    const refresh = () => {
      if (!index.loading) void indexActions.refetch();
      if (index() && !index()!.public && !activity.loading)
        void activityActions.refetch();
    };
    const events = new EventSource("/api/events");
    events.addEventListener("change", refresh);
    const interval = setInterval(refresh, 5000);
    onCleanup(() => {
      events.close();
      clearInterval(interval);
      window.removeEventListener("popstate", pop);
    });
  });
  const filtered = (kind: ResultEntry["kind"]) =>
    index()?.entries.filter(
      (entry) =>
        entry.kind === kind &&
        `${entry.name} ${entry.startedAt}`
          .toLowerCase()
          .includes(filter().toLowerCase()),
    ) ?? [];
  const modelFilters = createMemo(() =>
    route().models.split(",").filter(Boolean),
  );
  const completeChecks = () =>
    displayedScores().reduce(
      (sum, score) =>
        sum + score.components.reduce((count, part) => count + part.scored, 0),
      0,
    ) ?? 0;
  const expectedChecks = () =>
    displayedScores().reduce(
      (sum, score) =>
        sum +
        score.components.reduce((count, part) => count + part.expected, 0),
      0,
    );
  const elapsed = () => {
    const runtime =
      route().view === "evals"
        ? document()?.related.find((entry) => entry.eval === selectedEval())
            ?.runtime
        : data()?.runtime;
    const value = runtime
      ? runtimeMs(
          runtime,
          runtimeClock(
            now(),
            document()?.entry.updatedAt,
            data()?.status === "running",
          ),
        )
      : undefined;
    return value === undefined ? "—" : duration(value);
  };
  const scopedCost = () => {
    const value =
      route().view === "evals"
        ? data()?.evalCosts?.[selectedEval()]
        : data()?.cost;
    return (
      value?.usd ??
      (data()?.status === "running" ? value?.reportedUSD : undefined)
    );
  };
  const evalScores = createMemo(
    () =>
      data()?.scores.map((score) => {
        const components = score.components.filter(
          (part) => part.eval === selectedEval(),
        );
        return modelScore(score.model, components);
      }) ?? [],
  );
  const displayedScores = createMemo(() =>
    (route().view === "evals" ? evalScores() : (data()?.scores ?? [])).filter(
      (score) => matchesModelFilters(score.model, modelFilters()),
    ),
  );
  const inspect = async (model: string) => {
    const origin = route();
    const current = document();
    if (!current || isPublic() || topSecret()) return;
    setBusy(true);
    try {
      const runId =
        current.entry.kind === "eval"
          ? current.entry.id
          : current.related.find((item) => item.eval === selectedEval())?.id;
      if (!runId) throw new Error("This eval has not saved its results yet.");
      const available = loadRuns(runId);
      const loaded = available instanceof Promise ? await available : available;
      if (route() !== origin || topSecret()) return;
      const selected = loaded.runs.find(
        (run) =>
          run.model === model.split("#")[0] &&
          run.reasoning === (model.split("#")[1] ?? "default"),
      );
      if (!selected) throw new Error("No saved eval run for this model yet.");
      navigate({
        run: runId,
        evalRun: selected.id,
        eval: loaded.eval,
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const exportTotals = () => {
    const current = data();
    if (!current) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            benchmark:
              topSecret() && current.kind === "eval"
                ? "Evaluation results"
                : current.name,
            startedAt: current.startedAt,
            filters: modelFilters(),
            scores: displayedScores().map((score) => ({
              model: score.model,
              percentage: score.percentage,
              bounds: scoreBounds(score),
            })),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${topSecret() && current.kind === "eval" ? "evaluation" : current.name}-totals.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const exportImage = async () => {
    const current = data();
    if (!current || exportingImage()) return;
    setExportingImage(true);
    try {
      await downloadResultsImage(
        {
          name:
            topSecret() && (route().view === "evals" || current.kind === "eval")
              ? "Evaluation results"
              : route().view === "evals"
                ? selectedEval()
                : current.name,
          scores: displayedScores().map((score) => ({
            model: score.model,
            percentage: score.percentage,
            bounds: scoreBounds(score),
          })),
        },
        current.startedAt,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setExportingImage(false);
    }
  };
  const HistoryItem = (props: { item: ResultEntry }) => (
    <button
      class="history-item"
      classList={{
        active: route().view !== "activity" && route().id === props.item.id,
      }}
      aria-current={
        route().view !== "activity" && route().id === props.item.id
          ? "page"
          : undefined
      }
      onClick={() => choose(props.item)}
    >
      <div>
        <span class={`status-dot ${props.item.status}`} />
        <strong>
          <EvalName sensitive={props.item.kind === "eval"}>
            {props.item.name}
          </EvalName>
        </strong>
      </div>
      <small>
        {formatDate(props.item.startedAt)}
        <span>{props.item.models} models</span>
      </small>
    </button>
  );

  return (
    <div class="app-shell">
      <header class="app-titlebar">
        <div class="app-brand">
          <Button
            size="small"
            variant="ghost"
            icon="menu"
            class="mobile-menu"
            aria-label="Toggle run history"
            onClick={() => setSidebar(!sidebar())}
          />
          <Icon name="flask" />
          <strong>OpenEval</strong>
          <span class="titlebar-divider" /> <span>Results</span>
        </div>
        <div class="titlebar-actions">
          <SecretToggle />
        </div>
      </header>
      <aside class="sidebar" classList={{ visible: sidebar() }}>
        <Show when={index() && !isPublic()}>
          <button
            class="activity-link"
            classList={{ active: route().view === "activity" }}
            aria-current={route().view === "activity" ? "page" : undefined}
            onClick={() => {
              navigate({ view: "activity", run: "", evalRun: "" });
              setSidebar(false);
            }}
          >
            <Icon name="flask" />
            <span>Currently running</span>
            <Badge>
              {activity()?.reduce(
                (count, run) =>
                  count +
                  run.state.runs.reduce(
                    (stages, execution) =>
                      stages +
                      (execution.eval.status === "in_progress" ? 1 : 0) +
                      (execution.judge.status === "in_progress" ? 1 : 0),
                    0,
                  ),
                0,
              ) ?? 0}
            </Badge>
          </button>
        </Show>
        <div class="sidebar-heading">
          <span>RUN HISTORY</span>
          <Badge>{filtered("benchmark").length}</Badge>
        </div>
        <TextInput
          aria-label="Filter runs"
          placeholder="Find a run…"
          value={filter()}
          onInput={(event) => setFilter(event.currentTarget.value)}
          leadingIcon={<Icon name="magnifying-glass" />}
        />
        <div class="history-scroll">
          <div class="history-group">
            <span class="group-label">Benchmark runs</span>
            <For each={filtered("benchmark")}>
              {(entry) => <HistoryItem item={entry} />}
            </For>
            <Show when={!filtered("benchmark").length}>
              <p class="sidebar-empty">No benchmark runs yet.</p>
            </Show>
          </div>
        </div>
        <div class="sidebar-footer">
          <Icon name="folder" />
          <span>{isPublic() ? "Totals only" : "Local results"}</span>
        </div>
      </aside>
      <main class="main-panel">
        <Show when={index.error || document.error}>
          <div class="error-banner" role="alert">
            {topSecret()
              ? "Could not load results."
              : String(index.error ?? document.error)}
          </div>
        </Show>
        <Show when={notice()}>
          <div class="error-banner" role="alert">
            {topSecret()
              ? "The requested operation could not be completed."
              : notice()}
          </div>
        </Show>
        <Show
          when={route().view === "activity" && !isPublic()}
          fallback={
            <Show
              when={data()}
              fallback={
                <div class="empty-state">
                  <Icon name="flask" />
                  <h1>
                    {index.loading
                      ? "Loading results…"
                      : "Your results start here"}
                  </h1>
                  <p>
                    Run a benchmark, then its model comparisons will appear
                    here.
                  </p>
                </div>
              }
            >
              <Show when={traceOpen()}>
                <Show
                  when={traceRun()}
                  fallback={<div class="empty-state">Loading eval run…</div>}
                >
                  {(run) => {
                    const selectedRun = () =>
                      run().runs.find((item) => item.id === route().evalRun);
                    return (
                      <Show when={selectedRun()}>
                        {(selected) => (
                          <SessionDrawer
                            open
                            title="Eval run session"
                            onClose={closeTrace}
                          >
                            <EvalRunTrace
                              run={run()}
                              selected={selected()}
                              onRun={(id) => navigate({ evalRun: id })}
                              onBack={closeTrace}
                            />
                          </SessionDrawer>
                        )}
                      </Show>
                    );
                  }}
                </Show>
              </Show>
              <div class="results-page">
                <div class="page-heading">
                  <div>
                    <div class="breadcrumb">
                      {data()!.kind === "benchmark"
                        ? "Benchmarks"
                        : "Eval results"}
                      <Icon name="chevron-right" />
                      <EvalName sensitive={data()!.kind === "eval"}>
                        {data()!.name}
                      </EvalName>
                    </div>
                    <h1>
                      <EvalName sensitive={data()!.kind === "eval"}>
                        {data()!.name}
                      </EvalName>
                    </h1>
                    <p>
                      {formatDate(data()!.startedAt)}
                      <span>·</span>
                      <Badge>{data()!.status}</Badge>
                    </p>
                  </div>
                  <div class="results-actions">
                    <Show when={data()!.kind === "benchmark"}>
                      <Tooltip
                        value={
                          exportingImage() ? "Exporting image…" : "Export image"
                        }
                      >
                        <IconButton
                          variant="neutral"
                          size="small"
                          icon={<Icon name="photo" />}
                          aria-label="Export image"
                          aria-busy={exportingImage()}
                          onClick={exportImage}
                          disabled={exportingImage() || !data()!.scores.length}
                        />
                      </Tooltip>
                    </Show>
                    <Tooltip value="Export totals">
                      <IconButton
                        variant="neutral"
                        size="small"
                        icon={<Icon name="download" />}
                        aria-label="Export totals"
                        onClick={exportTotals}
                      />
                    </Tooltip>
                  </div>
                </div>
                <div class="results-toolbar">
                  <Show when={!isPublic() && data()!.kind === "benchmark"}>
                    <ResultTabs
                      value={route().view}
                      onChange={(view) =>
                        navigate({
                          view: view as Route["view"],
                          eval: selectedEval(),
                        })
                      }
                    />
                  </Show>
                  <ModelFilter
                    models={data()!.scores.map((score) => score.model)}
                    selected={modelFilters()}
                    onChange={(selected) =>
                      navigate({ models: selected.join(",") })
                    }
                  />
                </div>
                <Show when={route().view === "evals" && !isPublic()}>
                  <div class="eval-selector">
                    <span id="eval-label">Evaluation</span>
                    <Select
                      aria-labelledby="eval-label"
                      options={data()!.evals}
                      current={selectedEval()}
                      valueClass={
                        topSecret() ? "eval-name is-secret" : "eval-name"
                      }
                      label={(value) =>
                        topSecret()
                          ? `Eval ${data()!.evals.indexOf(value) + 1}`
                          : (data()?.evalNames?.[value] ?? value)
                      }
                      onSelect={(value) => {
                        if (value) navigate({ eval: value });
                      }}
                    >
                      {(value) => (
                        <EvalName>
                          {data()?.evalNames?.[value] ?? value}
                        </EvalName>
                      )}
                    </Select>
                  </div>
                </Show>
                <section class="chart-panel">
                  <div class="panel-heading">
                    <h2>
                      <EvalName
                        sensitive={
                          route().view === "evals" || data()!.kind === "eval"
                        }
                      >
                        {route().view === "evals" && !isPublic()
                          ? (data()?.evalNames?.[selectedEval()] ??
                            selectedEval())
                          : data()!.name}
                      </EvalName>
                    </h2>
                  </div>
                  <Show
                    when={displayedScores().length}
                    fallback={
                      <div class="model-filter-empty">
                        <p>No models match these filters.</p>
                        <Button
                          size="small"
                          variant="outline"
                          onClick={() => navigate({ models: "" })}
                        >
                          Clear filters
                        </Button>
                      </div>
                    }
                  >
                    <ScoreChart
                      scores={displayedScores()}
                      public={isPublic()}
                      incomplete={data()!.status !== "running"}
                      criteria={
                        (route().view === "evals" || data()!.kind === "eval") &&
                        !topSecret()
                      }
                      onSelect={
                        !isPublic() &&
                        !topSecret() &&
                        (route().view === "evals" || data()!.kind === "eval")
                          ? inspect
                          : undefined
                      }
                    />
                  </Show>
                </section>
                <Show when={!isPublic()}>
                  <div class="run-facts">
                    <div>
                      <span>Models</span>
                      <strong>{displayedScores().length}</strong>
                    </div>
                    <div>
                      <span>Evaluations</span>
                      <strong>
                        {route().view === "evals" ? 1 : data()!.evals.length}
                      </strong>
                    </div>
                    <div>
                      <span>Scored checks</span>
                      <strong>
                        {completeChecks()} <small>/ {expectedChecks()}</small>
                      </strong>
                    </div>
                    <div>
                      <span>
                        {modelFilters().length ? "Run duration" : "Duration"}
                      </span>
                      <strong>{elapsed()}</strong>
                    </div>
                    <div>
                      <span>{modelFilters().length ? "Run cost" : "Cost"}</span>
                      <strong>{formatCost(scopedCost())}</strong>
                    </div>
                  </div>
                </Show>
                <Show
                  when={displayedScores().some(
                    (score) => score.percentage === null,
                  )}
                >
                  <div class="pending-note">
                    <Icon name="info" />
                    <p>
                      {data()!.status === "running"
                        ? "Solid bars show earned points. Whiskers show the possible range for unresolved checks."
                        : "Whiskers show the possible range for unscored checks; graded failures remain known zeros."}
                    </p>
                  </div>
                </Show>
                <Show when={busy()}>
                  <p class="section-caption">Opening eval run…</p>
                </Show>
              </div>
            </Show>
          }
        >
          <Show when={activity.error}>
            <div class="error-banner">
              {topSecret()
                ? "Could not load activity."
                : String(activity.error)}
            </div>
          </Show>
          <Activity
            runs={activity() ?? []}
            run={route().run}
            evalRun={route().evalRun}
            stage={route().stage}
            onSelect={(run, evalRun, stage = "eval") => {
              if (!topSecret() || !evalRun)
                navigate({ view: "activity", run, evalRun, stage });
            }}
          />
        </Show>
      </main>
    </div>
  );
}
