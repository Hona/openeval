import {
  createEffect,
  createMemo,
  createSignal,
  ErrorBoundary,
  on,
  onCleanup,
  Show,
} from "solid-js";
import { Tabs } from "@opencode/ui/tabs";
import { Button } from "@opencode/ui/button";
import { Icon } from "@opencode/ui/icon";
import { IconButton } from "@opencode/ui/icon-button";
import { Tooltip } from "@opencode/ui/tooltip";
import type { LiveEvalRun } from "../types";
import { RecordedTimeline } from "./session-timeline";
import { createSessionStream } from "../session-stream";
import { JudgeAuditPanel } from "./judge-audit";

export function SessionTabs(props: {
  benchmarkId: string;
  candidateId?: string;
  judgeId?: string;
  state?: LiveEvalRun;
  initialTab?: "session" | "judge";
}) {
  const [tab, setTab] = createSignal<string>(props.initialTab ?? "session");
  const [judgeOverride, setJudgeOverride] = createSignal<string>();
  const judgeId = () => judgeOverride() ?? props.judgeId;
  const codeOnly = () =>
    tab() === "judge" && props.state?.judge.kind === "code";
  createEffect(
    on(
      () => props.initialTab,
      (initial) => {
        if (initial) setTab(initial);
      },
      { defer: true },
    ),
  );
  const stream = createSessionStream({
    benchmark: () => props.benchmarkId,
    execution: () =>
      codeOnly()
        ? undefined
        : tab() === "judge"
          ? judgeId()
          : props.candidateId,
    stage: () => (tab() === "judge" ? "judge" : "candidate"),
  });
  const [raw, setRaw] = createSignal(false);
  const selection = createMemo(
    () => `${props.benchmarkId}:${props.candidateId}`,
  );
  createEffect(
    on(selection, () => {
      setRaw(false);
      setJudgeOverride(undefined);
    }),
  );
  const [follow, setFollow] = createSignal(true);
  let scroller: HTMLDivElement | undefined;
  let frame: number | undefined;
  const current = () => stream.state() ?? props.state;
  createEffect(() => {
    stream.revision();
    tab();
    if (!follow()) return;
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (scroller && follow()) scroller.scrollTop = scroller.scrollHeight;
    });
  });
  onCleanup(() => {
    if (frame !== undefined) cancelAnimationFrame(frame);
  });
  const working = (name: "candidate" | "judge") =>
    props.state
      ? (name === "judge" ? props.state.judge : props.state.eval).status ===
        "in_progress"
      : current()?.status === "in_progress" &&
        (current()?.stage ?? "candidate") === name;
  return (
    <div
      class="session-inspector"
      data-code-only={codeOnly() ? "true" : undefined}
      data-candidate-sessions={stream.stage("candidate").sessions.length}
      data-judge-sessions={stream.stage("judge").sessions.length}
    >
      <Tabs
        variant="pill"
        value={tab()}
        onChange={(value) => {
          setTab(value);
          setFollow(true);
        }}
        class="session-tabs"
      >
        <div class="session-tab-heading">
          <Tabs.List aria-label="Eval run sessions">
            <Tabs.Trigger value="session">Session</Tabs.Trigger>
            <Tabs.Trigger value="judge">
              <Icon name="shield" />
              Judge
            </Tabs.Trigger>
          </Tabs.List>
          <span class="session-connection" role="status">
            {codeOnly() ? "Code judgment" : stream.connection()}
          </span>
          <Show when={!codeOnly()}>
            <Tooltip value={raw() ? "Show timeline" : "Show raw JSON"}>
              <IconButton
                size="small"
                variant="ghost-muted"
                icon={<Icon name="code" />}
                aria-label={raw() ? "Show timeline" : "Show raw JSON"}
                aria-pressed={raw()}
                onClick={() => setRaw(!raw())}
              />
            </Tooltip>
          </Show>
        </div>
        <Show when={tab() === "session" && props.state?.stop}>
          <div class="early-stop-note">
            <Icon name="shield" />
            <span>
              {props.state!.stop!.applied ? "Stopped early" : "Stop requested"}{" "}
              · evidence through #{props.state!.stop!.checkpoint.through}
            </span>
            <button
              onClick={() => {
                setJudgeOverride(props.state!.stop!.judgeRunId);
                setTab("judge");
                setFollow(false);
              }}
            >
              View decision
            </button>
          </div>
        </Show>
        <Show
          when={
            tab() === "judge" &&
            judgeOverride() &&
            judgeOverride() !== props.judgeId
          }
        >
          <div class="early-stop-note">
            <span>Judge session that requested the early stop</span>
            <button onClick={() => setJudgeOverride(undefined)}>
              Current judgment
            </button>
          </div>
        </Show>
        <Show when={tab() === "judge" && judgeId()}>
          <JudgeAuditPanel
            benchmarkId={props.benchmarkId}
            judgeId={judgeId()!}
            onSelectJudge={setJudgeOverride}
          />
        </Show>
        <Show when={!codeOnly()}>
          <div
            class="session-timeline-scroll"
            ref={scroller}
            onWheel={(event) => {
              if (event.deltaY < 0) setFollow(false);
            }}
            onTouchStart={() => setFollow(false)}
            onPointerDown={(event) => {
              if (event.target === scroller) setFollow(false);
            }}
            onKeyDown={(event) => {
              if (["ArrowUp", "PageUp", "Home"].includes(event.key))
                setFollow(false);
            }}
            onScroll={() => {
              if (
                scroller &&
                scroller.scrollHeight -
                  scroller.scrollTop -
                  scroller.clientHeight <
                  50
              )
                setFollow(true);
            }}
          >
            <Show
              when={!raw()}
              fallback={
                <pre class="raw-document">
                  {JSON.stringify(
                    {
                      stage: tab(),
                      document: stream.stage(
                        tab() === "judge" ? "judge" : "candidate",
                      ),
                    },
                    null,
                    2,
                  )}
                </pre>
              }
            >
              <ErrorBoundary
                fallback={
                  <div class="error-banner" role="alert">
                    Could not render this recorded timeline. The saved data is
                    available from the code icon.
                  </div>
                }
              >
                <Tabs.Content value="session">
                  <RecordedTimeline
                    stage={stream.stage("candidate")}
                    running={working("candidate")}
                    pending={
                      current()?.status === "queued" ||
                      current()?.status === "in_progress"
                    }
                  />
                </Tabs.Content>
                <Tabs.Content value="judge">
                  <RecordedTimeline
                    stage={stream.stage("judge")}
                    running={working("judge")}
                    pending={
                      current()?.status === "queued" ||
                      current()?.status === "in_progress"
                    }
                  />
                </Tabs.Content>
              </ErrorBoundary>
            </Show>
          </div>
        </Show>
      </Tabs>
      <Show when={!follow() && current()?.status === "in_progress"}>
        <Button
          class="follow-stream"
          size="small"
          variant="outline"
          onClick={() => setFollow(true)}
        >
          Follow stream
        </Button>
      </Show>
    </div>
  );
}
