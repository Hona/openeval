import {
  createEffect,
  createResource,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js";
import { Icon } from "@opencode/ui/icon";
import { Select } from "@opencode/ui/select";
import type { JudgeAudit } from "../types";
import { duration, stateLabel, formatPercent } from "../model";
import { topSecret } from "../privacy";

type Query = {
  action: string;
  id?: string;
  offset?: number;
  path?: string;
  revision?: "initial" | "final";
  metric?: string;
};
async function get<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

/** A numbered decision ledger linked to the exact, immutable evidence each turn read. */
export function JudgeAuditPanel(props: {
  benchmarkId: string;
  judgeId: string;
  onSelectJudge: (id: string) => void;
}) {
  const [audit, actions] = createResource(
    () => !topSecret() && `${props.benchmarkId}:${props.judgeId}`,
    () =>
      get<JudgeAudit>(
        `/api/judge-checks?${new URLSearchParams({ benchmark: props.benchmarkId, judge: props.judgeId })}`,
      ),
  );
  const [selected, setSelected] = createSignal("");
  const [query, setQuery] = createSignal<Query>({ action: "summary" });
  const [back, setBack] = createSignal<Query[]>([]);
  const [evidence] = createResource(
    () =>
      !topSecret() && !!selected() ? { check: selected(), ...query() } : false,
    (input) => {
      const params = new URLSearchParams({
        benchmark: props.benchmarkId,
        judge: props.judgeId,
        check:
          input.check === "judgment"
            ? (audit()?.judge.decisionCheckId ?? "")
            : input.check,
        action: input.action,
      });
      if (input.id !== undefined) params.set("id", input.id);
      if (input.offset !== undefined)
        params.set("offset", String(input.offset));
      if (input.path) params.set("path", input.path);
      if (input.revision) params.set("revision", input.revision);
      if (input.metric) params.set("metric", input.metric);
      return get<Record<string, unknown>>(`/api/check-evidence?${params}`);
    },
  );
  createEffect(() => {
    props.judgeId;
    setSelected("");
    setQuery({ action: "summary" });
    setBack([]);
  });
  const timer = setInterval(() => {
    if (!topSecret() && audit()?.judge.state === "running" && !audit.loading)
      void actions.refetch();
  }, 2000);
  onCleanup(() => clearInterval(timer));
  const choose = (id: string) => {
    setSelected(selected() === id ? "" : id);
    setQuery({ action: "summary" });
    setBack([]);
  };
  const navigate = (next: Query) => {
    setBack([...back(), query()]);
    setQuery(next);
  };
  const items = () =>
    Array.isArray(evidence()?.items)
      ? (evidence()!.items as Record<string, unknown>[])
      : undefined;
  const label = (
    check: NonNullable<ReturnType<typeof audit>>["checks"][number],
  ) =>
    check.state !== "completed"
      ? stateLabel(check.state)
      : check.decision?.kind === "continue"
        ? "Continue"
        : check.decision?.judgment.value === 1
          ? "Pass"
          : check.decision?.judgment.value === 0
            ? "Fail"
            : typeof check.decision?.judgment.value === "number"
              ? `${Math.round(check.decision.judgment.value * 100)}%`
              : "Unknown";
  return (
    <Show
      when={
        !topSecret() &&
        (audit()?.checks.length ||
          Object.keys(audit()?.judge.judgment?.scores ?? {}).length ||
          audit()?.judge.code ||
          audit()?.judge.error ||
          audit()?.metrics ||
          audit()?.judge.monitorError ||
          audit()?.judge.monitorLimit ||
          (audit()?.history.length ?? 0) > 1 ||
          audit.error)
      }
    >
      <details class="judge-audit" open>
        <summary>
          <Icon name="shield" />
          <strong>Judgment and evidence</strong>
          <span>
            {audit()?.checks.length
              ? `${audit()!.checks.length} checkpoint checks`
              : "Final judgment"}
          </span>
        </summary>
        <Show when={audit.error}>
          <p class="error-banner">Could not load judging checkpoints.</p>
        </Show>
        <Show when={audit()?.judge.error}>
          <p class="error-banner">{audit()!.judge.error}</p>
        </Show>
        <div class="judgment-criteria">
          <For each={Object.entries(audit()?.judge.judgment?.scores ?? {})}>
            {([id, score]) => (
              <article>
                <header>
                  <strong>
                    {audit()?.criteria.find((item) => item.id === id)?.name ??
                      id}
                  </strong>
                  <span>
                    {score.value === null
                      ? "Unknown"
                      : score.value === 1
                        ? "Pass"
                        : score.value === 0
                          ? "Fail"
                          : formatPercent(score.value * 100)}
                  </span>
                </header>
                <p>{score.reason}</p>
                <div class="checkpoint-actions">
                  <For each={score.evidence}>
                    {(citation) => (
                      <button
                        onClick={() => {
                          setSelected("judgment");
                          setBack([]);
                          setQuery({
                            action:
                              citation.kind === "recording"
                                ? "summary"
                                : citation.kind === "metric"
                                  ? "metrics"
                                  : citation.kind,
                            ...(citation.kind === "metric"
                              ? { metric: citation.id }
                              : {}),
                            ...("id" in citation ? { id: citation.id } : {}),
                            ...("path" in citation
                              ? {
                                  path: citation.path,
                                  revision: citation.revision,
                                }
                              : {}),
                            offset: citation.offset,
                          });
                        }}
                      >
                        Read {citation.kind}
                        {"path" in citation ? `: ${citation.path}` : ""}
                      </button>
                    )}
                  </For>
                </div>
                <For each={score.sources}>
                  {(url) => (
                    <a
                      class="judgment-source"
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {url}
                    </a>
                  )}
                </For>
              </article>
            )}
          </For>
        </div>
        <Show when={audit()?.judge.code}>
          {(code) => (
            <section class="code-judgment" aria-label="Code judgment">
              <header>
                <strong>judge.ts</strong>
                <span>
                  {stateLabel(code().state)} · {duration(code().elapsedMs)}
                </span>
              </header>
              <Show when={code().output !== undefined}>
                <details open>
                  <summary>Returned JSON</summary>
                  <pre class="checkpoint-content">
                    {JSON.stringify(code().output, null, 2)}
                  </pre>
                </details>
              </Show>
              <details>
                <summary>
                  Frozen source · {code().sourceHash.slice(0, 12)}
                </summary>
                <pre class="checkpoint-content">{audit()?.codeSource}</pre>
              </details>
              <Show when={audit()?.codeStdout}>
                <details>
                  <summary>Standard output</summary>
                  <pre class="checkpoint-content">{audit()?.codeStdout}</pre>
                </details>
              </Show>
              <Show when={audit()?.codeStderr}>
                <details>
                  <summary>Standard error</summary>
                  <pre class="checkpoint-content">{audit()?.codeStderr}</pre>
                </details>
              </Show>
            </section>
          )}
        </Show>
        <Show when={audit()?.metrics}>
          <details class="recorded-metrics">
            <summary>Recorded metrics · candidate only</summary>
            <pre class="checkpoint-content">
              {JSON.stringify(audit()?.metrics, null, 2)}
            </pre>
          </details>
        </Show>
        <Show when={selected() === "judgment"}>
          <div class="judge-check-detail">
            <Show when={evidence.error}>
              <p class="error-banner">{String(evidence.error)}</p>
            </Show>
            <pre class="checkpoint-content">
              {evidence.loading
                ? "Loading evidence…"
                : typeof evidence()?.text === "string"
                  ? (evidence()!.text as string)
                  : JSON.stringify(evidence(), null, 2)}
            </pre>
            <Show when={typeof evidence()?.next === "number"}>
              <button
                onClick={() =>
                  setQuery({ ...query(), offset: evidence()!.next as number })
                }
              >
                Next page
              </button>
            </Show>
          </div>
        </Show>
        <Show when={(audit()?.history.length ?? 0) > 1}>
          <div class="judge-history">
            <Select
              aria-label="Judging history"
              options={audit()!.history.map((run) => run.id)}
              current={props.judgeId}
              label={(id) => {
                const run = audit()!.history.find((run) => run.id === id)!;
                return `${run.mode === "monitor" ? "Monitoring" : "Final judge"} · ${new Date(run.startedAt).toLocaleTimeString()} · ${stateLabel(run.state)}`;
              }}
              onSelect={(id) => {
                if (id) props.onSelectJudge(id);
              }}
            />
          </div>
        </Show>
        <Show when={audit()?.judge.monitorError}>
          <p class="judge-audit-warning">
            Monitoring ended{" "}
            {audit()!.judge.monitorErrorAt
              ? `at ${new Date(audit()!.judge.monitorErrorAt!).toLocaleTimeString()}`
              : ""}
            : {audit()!.judge.monitorError}. Final grading uses the saved work.
          </p>
        </Show>
        <Show when={audit()?.judge.monitorLimit}>
          <p class="judge-audit-warning">
            {audit()!.judge.monitorLimit}. The candidate continues normally;
            final grading uses its completed evidence.
          </p>
        </Show>
        <ol class="judge-checks">
          <For each={audit()?.checks}>
            {(check, index) => (
              <li
                classList={{
                  decisive: audit()?.judge.decisionCheckId === check.id,
                }}
              >
                <button
                  class="judge-check-heading"
                  onClick={() => choose(check.id)}
                  aria-expanded={selected() === check.id}
                >
                  <span class="judge-check-number">
                    {String(index() + 1).padStart(2, "0")}
                  </span>
                  <strong>{label(check)}</strong>
                  <span>
                    {check.purpose === "final"
                      ? "Final archive"
                      : `Through event #${check.checkpoint.through}`}
                  </span>
                  <time dateTime={check.startedAt} title={check.startedAt}>
                    {new Date(check.startedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </time>
                  <Icon
                    name={
                      selected() === check.id ? "chevron-down" : "chevron-right"
                    }
                  />
                </button>
                <p class="judge-check-reason">
                  {check.decision?.kind === "continue"
                    ? check.decision.reason
                    : (check.decision?.judgment.reason ??
                      check.error ??
                      "Waiting for the judge")}
                </p>
                <Show when={audit()?.stop?.checkId === check.id}>
                  <p class="judge-check-stop">
                    Stop requested{" "}
                    {new Date(audit()!.stop!.requestedAt).toLocaleTimeString()}
                    {audit()!.stop!.applied === undefined
                      ? " · Awaiting interruption"
                      : audit()!.stop!.applied
                        ? " · Session stopped early"
                        : " · Session had already ended"}
                  </p>
                </Show>
                <Show when={selected() === check.id}>
                  <div class="judge-check-detail">
                    <details class="checkpoint-identity">
                      <summary>
                        Evidence identity{" "}
                        <code>{check.checkpoint.hash.slice(0, 12)}</code>
                      </summary>
                      <dl>
                        <dt>Check</dt>
                        <dd>{check.id}</dd>
                        <dt>Evidence SHA-256</dt>
                        <dd>{check.checkpoint.hash}</dd>
                        <dt>Judge events</dt>
                        <dd>
                          {check.events.after + 1}–
                          {check.events.through ?? "live"}
                        </dd>
                        <Show when={check.checkpoint.cutoffAt !== undefined}>
                          <dt>Evidence cutoff</dt>
                          <dd>
                            {new Date(check.checkpoint.cutoffAt!).toISOString()}
                          </dd>
                          <dt>Boundary event</dt>
                          <dd>{check.checkpoint.boundaryEventId}</dd>
                          <dt>Native cursors</dt>
                          <dd>{JSON.stringify(check.checkpoint.cursors)}</dd>
                        </Show>
                        <dt>Duration</dt>
                        <dd>
                          {check.runtimeMs !== undefined
                            ? duration(check.runtimeMs)
                            : "—"}
                        </dd>
                      </dl>
                    </details>
                    <nav
                      aria-label="Checkpoint evidence"
                      class="checkpoint-actions"
                    >
                      <For
                        each={[
                          "summary",
                          "messages",
                          "tools",
                          "events",
                          "response",
                        ]}
                      >
                        {(action) => (
                          <button
                            classList={{ selected: query().action === action }}
                            onClick={() => {
                              setQuery({ action });
                              setBack([]);
                            }}
                          >
                            {action}
                          </button>
                        )}
                      </For>
                    </nav>
                    <Show when={evidence.loading}>
                      <p class="checkpoint-status">Loading evidence…</p>
                    </Show>
                    <Show when={evidence.error}>
                      <p class="error-banner">{String(evidence.error)}</p>
                    </Show>
                    <Show when={!evidence.loading && evidence()}>
                      <Show
                        when={items()}
                        fallback={
                          <pre class="checkpoint-content">
                            {typeof evidence()!.text === "string"
                              ? (evidence()!.text as string)
                              : JSON.stringify(evidence(), null, 2)}
                          </pre>
                        }
                      >
                        <div class="checkpoint-items">
                          <For each={items()}>
                            {(item) => (
                              <button
                                onClick={() =>
                                  navigate({
                                    action:
                                      query().action === "events"
                                        ? "event"
                                        : query().action === "tools"
                                          ? "tool"
                                          : "message",
                                    id: String(item.id ?? item.sequence),
                                  })
                                }
                              >
                                <strong>
                                  {String(
                                    item.name ??
                                      item.type ??
                                      item.role ??
                                      "Item",
                                  )}
                                </strong>
                                <span>
                                  {String(item.id ?? `#${item.sequence}`)}
                                </span>
                                <Show when={item.preview}>
                                  <p>{String(item.preview)}</p>
                                </Show>
                              </button>
                            )}
                          </For>
                        </div>
                      </Show>
                      <div class="checkpoint-actions">
                        <Show when={back().length}>
                          <button
                            onClick={() => {
                              const history = back();
                              setQuery(history[history.length - 1]);
                              setBack(history.slice(0, -1));
                            }}
                          >
                            Back
                          </button>
                        </Show>
                        <Show when={typeof evidence()?.next === "number"}>
                          <button
                            onClick={() =>
                              navigate({
                                ...query(),
                                offset: evidence()!.next as number,
                              })
                            }
                          >
                            Next page
                          </button>
                        </Show>
                      </div>
                    </Show>
                  </div>
                </Show>
              </li>
            )}
          </For>
        </ol>
      </details>
    </Show>
  );
}
