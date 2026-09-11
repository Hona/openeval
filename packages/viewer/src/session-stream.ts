import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  type Accessor,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import type { RunEvent, Stage } from "@hona/openeval/types";
import type { LiveEvalRun, SessionStage, SessionSnapshot } from "@hona/openeval/view";
import { applySessionRecord, emptyStage } from "@hona/openeval/session";

const viewed = new Map<string, { document: SessionStage }>();
export function createSessionStream(input: {
  benchmark: Accessor<string>;
  execution: Accessor<string | undefined>;
  stage: Accessor<Stage>;
}) {
  const [document, setDocument] = createStore(emptyStage());
  const [state, setState] = createSignal<LiveEvalRun>();
  const [connection, setConnection] = createSignal("Connecting…");
  const [revision, setRevision] = createSignal(0);
  const key = createMemo(() => `${input.benchmark()}:${input.execution()}`);
  createEffect(
    on(key, (selected) => {
      let model = emptyStage();
      const cached = viewed.get(selected);
      batch(() => {
        setDocument(reconcile(structuredClone(cached?.document ?? model)));
        setState(undefined);
        setConnection(cached ? "Session saved" : "Connecting…");
        setRevision((value) => value + 1);
      });
      if (cached) return;
      if (!input.execution()) {
        setConnection("Waiting for session");
        return;
      }
      const events = new EventSource(
        `/api/session?benchmark=${encodeURIComponent(input.benchmark())}&execution=${encodeURIComponent(input.execution()!)}`,
      );
      events.onopen = () => setConnection("Streaming");
      events.onerror = () => setConnection("Reconnecting…");
      events.addEventListener("snapshot", (event) => {
        const snapshot = JSON.parse(
          (event as MessageEvent).data,
        ) as SessionSnapshot;
        model = snapshot.document;
        batch(() => {
          setDocument(reconcile(structuredClone(model)));
          setRevision((value) => value + 1);
        });
      });
      events.addEventListener("records", (event) => {
        const records = JSON.parse((event as MessageEvent).data) as RunEvent[];
        for (const record of records) applySessionRecord(model, record);
        batch(() => {
          setDocument(reconcile(structuredClone(model)));
          setRevision((value) => value + 1);
        });
      });
      events.addEventListener("state", (event) =>
        setState(JSON.parse((event as MessageEvent).data)),
      );
      events.addEventListener("done", () => {
        viewed.delete(selected);
        viewed.set(selected, { document: structuredClone(model) });
        if (viewed.size > 8) viewed.delete(viewed.keys().next().value!);
        setConnection("Session saved");
        events.close();
      });
      events.addEventListener("session-error", () => {
        setConnection("Session unavailable");
        events.close();
      });
      onCleanup(() => events.close());
    }),
  );
  const empty = emptyStage();
  return {
    state,
    connection,
    revision,
    stage: (stage: Stage) => (stage === input.stage() ? document : empty),
  };
}
