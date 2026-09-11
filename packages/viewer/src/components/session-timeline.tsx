import { createMemo, createSignal, For, Show, type Accessor } from "solid-js";
import { createStore } from "solid-js/store";
import { Button } from "@opencode/ui/button";
import { FileComponentProvider } from "@opencode/ui/context/file";
import { File } from "@opencode/session-ui/file";
import { DataProvider } from "@opencode/session-ui/context";
import {
  createReactiveTimelineProjection,
  TimelineRow,
} from "@opencode/session-ui/timeline/projection";
import { createSessionTimelineRowRenderer } from "@opencode/session-ui/timeline/row";
import { timelinePresets } from "@opencode/session-ui/timeline/detail";
import type { SessionStatus } from "@opencode/client/promise";
import type { RecordedSession, SessionStage } from "@hona/openeval/view";
import { modelName } from "../model";

const compact = timelinePresets.find(
  (preset) => preset.id === "compact",
)!.value;

/** The same projection, compact preset and row renderer used by the desktop. */
function DesktopTimeline(props: {
  session: RecordedSession;
  status: SessionStatus;
}) {
  const projection = createReactiveTimelineProjection({
    sessionMessages: () => props.session.messages,
    status: () => props.status,
    reasoningMode: () => "compact",
    timelineDetail: () => compact,
    shellToolDefaultOpen: () => false,
    editToolDefaultOpen: () => false,
  });
  const [open, setOpen] = createStore<Record<string, boolean | undefined>>({});
  const renderer = createSessionTimelineRowRenderer({
    sessionID: () => props.session.sessionID,
    status: () => props.status,
    projection,
    presentation: () => undefined,
    reasoningMode: () => "compact",
    timelineDetail: () => compact,
    shellToolDefaultOpen: () => false,
    editToolDefaultOpen: () => false,
    padding: () => "",
    disclosure: {
      value: (key) => open[key],
      set: (key, value) => setOpen(key, value),
    },
  });
  const keys = createMemo(() => projection.rows().map(TimelineRow.key));
  function Row(props: { rowKey: string }) {
    const initial = projection.rowByKey().get(props.rowKey)!;
    const row = createMemo(
      () => projection.rowByKey().get(props.rowKey) ?? initial,
    );
    return <renderer.Row row={row} />;
  }
  return (
    <div data-component="session-timeline">
      <For each={keys()}>{(rowKey) => <Row rowKey={rowKey} />}</For>
    </div>
  );
}

export function RecordedTimeline(props: {
  stage: SessionStage;
  running: boolean;
  pending?: boolean;
}) {
  const [selected, setSelected] = createSignal("");
  const root = () =>
    props.stage.sessions.find((session) => !session.parentID) ??
    props.stage.sessions[0];
  const current = () =>
    props.stage.sessions.find((session) => session.sessionID === selected()) ??
    root();
  const status = (session: RecordedSession): SessionStatus =>
    props.running ? session.status : { type: "idle" };
  const providers = createMemo(() => {
    const all = new Map<string, { models: Record<string, { name: string }> }>();
    for (const session of props.stage.sessions) {
      const models = [
        session.model,
        ...session.messages.flatMap((message) =>
          message.type === "assistant" ? [message.model] : [],
        ),
      ];
      for (const model of models) {
        if (!all.has(model.providerID))
          all.set(model.providerID, { models: {} });
        all.get(model.providerID)!.models[model.id] = {
          name: modelName(`${model.providerID}/${model.id}`),
        };
      }
    }
    return { all, connected: [...all.keys()], default: {} };
  });
  return (
    <div class="native-transcript" data-workspace-session>
      <Show when={current() && current() !== root()}>
        <Button
          size="small"
          variant="ghost-muted"
          icon="arrow-left"
          onClick={() => setSelected("")}
        >
          Parent session
        </Button>
      </Show>
      <Show
        when={current()?.sessionID}
        keyed
        fallback={
          <p class="empty-inline">
            {props.pending
              ? "Waiting for session activity…"
              : "No session was recorded."}
          </p>
        }
      >
        {(id) => (
          <DataProvider
            directory="/workspace"
            sessionID={id}
            data={{
              agent: [
                ...new Set(
                  props.stage.sessions.map((session) => session.agent),
                ),
              ].map((name) => ({ name })),
              provider: providers(),
              session: props.stage.sessions.map((session) => ({
                id: session.sessionID,
                parentID: session.parentID,
                title: session.title,
                time: { created: session.created, updated: session.created },
              })),
              session_status: Object.fromEntries(
                props.stage.sessions.map((session) => [
                  session.sessionID,
                  status(session),
                ]),
              ),
              session_diff: {},
            }}
            onNavigateToSession={(id) => {
              if (
                props.stage.sessions.some((session) => session.sessionID === id)
              )
                setSelected(id);
            }}
          >
            <FileComponentProvider component={File}>
              <DesktopTimeline
                session={current()!}
                status={status(current()!)}
              />
            </FileComponentProvider>
          </DataProvider>
        )}
      </Show>
    </div>
  );
}
