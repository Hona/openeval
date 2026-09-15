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
import type { Stage } from "@hona/openeval/types";
import type { SessionStage } from "@hona/openeval/view";
import { applySessionRecord, emptyStage } from "@hona/openeval/session";
import { useViewer } from "./data/context";
import type { SessionProgress, ViewerDataSource } from "./data/types";

const caches = new WeakMap<ViewerDataSource, Map<string, SessionStage>>();

/** UI state projection only; the injected source owns transport and subscriptions. */
export function createSessionStream(input: {
  benchmark: Accessor<string>;
  execution: Accessor<string | undefined>;
  stage: Accessor<Stage>;
}) {
  const { source } = useViewer();
  const viewed = caches.get(source) ?? new Map<string, SessionStage>();
  caches.set(source, viewed);
  const [document, setDocument] = createStore(emptyStage());
  const [state, setState] = createSignal<SessionProgress>();
  const [connection, setConnection] = createSignal("Connecting…");
  const [revision, setRevision] = createSignal(0);
  const key = createMemo(() => `${input.benchmark()}:${input.execution()}`);
  createEffect(
    on(key, (selected) => {
      let model = emptyStage();
      const cached = viewed.get(selected);
      const publish = () =>
        batch(() => {
          setDocument(reconcile(structuredClone(model)));
          setRevision((value) => value + 1);
        });
      batch(() => {
        model = structuredClone(cached ?? model);
        publish();
        setState(undefined);
        setConnection(cached ? "Session saved" : "Connecting…");
      });
      if (cached) return;
      if (!input.execution()) {
        setConnection("Waiting for session");
        return;
      }
      let active = true;
      const unsubscribe = source.watchSession(
        input.benchmark(),
        input.execution()!,
        (event) => {
          if (!active) return;
          switch (event.type) {
            case "snapshot":
              model = event.document;
              publish();
              break;
            case "records":
              for (const record of event.records)
                applySessionRecord(model, record);
              publish();
              break;
            case "state":
              setState(event.state);
              break;
            case "connection":
              setConnection(
                {
                  streaming: "Streaming",
                  reconnecting: "Reconnecting…",
                  unavailable: "Session unavailable",
                }[event.state],
              );
              break;
            case "complete":
              viewed.delete(selected);
              viewed.set(selected, structuredClone(model));
              if (viewed.size > 8) viewed.delete(viewed.keys().next().value!);
              setConnection("Session saved");
              break;
          }
        },
      );
      onCleanup(() => {
        active = false;
        unsubscribe();
      });
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
