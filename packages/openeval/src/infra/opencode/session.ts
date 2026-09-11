import {
  OpenCode,
  type OpenCodeClient,
  type SessionMessageInfo,
  type SessionInfo,
} from "@opencode/client";
import { setTimeout as delay } from "node:timers/promises";
import { trackTool } from "../evidence/tool-calls";
export { trackTool } from "../evidence/tool-calls";
import type {
  ModelRef,
  Accounting,
  ToolCall,
  OpenCodeStreamEvent,
} from "../../types";

export type RecordedSession = {
  info: SessionInfo;
  messages: SessionMessageInfo[];
};
export type SessionResult = {
  sessions: RecordedSession[];
  text: string;
  tools: ToolCall[];
  accounting?: Accounting;
  state: "completed" | "stopped" | "failed" | "timed_out";
  error?: string;
};

export const clientFor = (url: string, password?: string) =>
  OpenCode.make({
    baseUrl: url,
    headers: password
      ? {
          authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`,
        }
      : undefined,
  });
export const parseModel = (ref: ModelRef) => {
  const [name, variant] = ref.split("#"),
    slash = name.indexOf("/");
  return {
    providerID: name.slice(0, slash),
    id: name.slice(slash + 1),
    ...(variant ? { variant } : {}),
  };
};

/** Reconnect streams and confirm completion from either events or the saved session outcome. */
export async function runSession(
  client: OpenCodeClient,
  input: {
    model: ModelRef;
    agent: string;
    prompt: string;
    directory: string;
    timeoutMs: number;
    signal?: AbortSignal;
    /** Reuse an existing judge session for another turn. */
    sessionId?: string;
    after?: number;
    onCreated?: (sessionId: string) => void;
  },
  onEvent: (event: OpenCodeStreamEvent) => void,
): Promise<SessionResult> {
  const location = { directory: input.directory };
  await client.plugin.awaitActivation({ location });
  const models = await client.model.list({ location });
  const selected = parseModel(input.model);
  const model = models.data.find(
    (model) =>
      model.providerID === selected.providerID && model.id === selected.id,
  );
  if (
    !model ||
    (selected.variant &&
      !model.variants.some((variant) => variant.id === selected.variant))
  )
    throw new Error(`Model or reasoning variant unavailable: ${input.model}`);
  const root = input.sessionId
    ? await client.session.get({ sessionID: input.sessionId })
    : await client.session.create({
        location,
        model: selected,
        agent: input.agent,
      });
  const ids = new Set([root.id]);
  input.onCreated?.(root.id);
  const recorded = new Set<string>();
  const tools = new Map<string, ToolCall>();
  const streams = new AbortController();
  const done = Promise.withResolvers<void>();
  let timedOut = false,
    stopped = false,
    terminal: SessionInfo["outcome"],
    failure: string | undefined,
    transportError: string | undefined;
  let recordingError: unknown;
  let stopDeadline: ReturnType<typeof setTimeout> | undefined;
  const finish = (outcome: SessionInfo["outcome"]) => {
    if (!outcome) return;
    terminal = outcome;
    done.resolve();
    streams.abort();
  };
  const consume = (event: OpenCodeStreamEvent) => {
    if (!("id" in event)) return;
    if (
      "durable" in event &&
      event.durable.aggregateID === root.id &&
      event.durable.seq <= (input.after ?? -1)
    )
      return;
    if (recorded.has(event.id)) return;
    recorded.add(event.id);
    try {
      onEvent(event);
    } catch (error) {
      recordingError = error;
      done.resolve();
      streams.abort();
      throw error;
    }
    if (event.type === "session.created") ids.add(event.data.sessionID);
    if (event.type.startsWith("session.tool.")) trackTool(tools, event);
    if (
      !("data" in event) ||
      !("sessionID" in event.data) ||
      event.data.sessionID !== root.id
    )
      return;
    if (event.type === "session.execution.failed") {
      failure = event.data.error.message;
      finish("failed");
    }
    if (event.type === "session.execution.succeeded") finish("succeeded");
    if (event.type === "session.execution.interrupted") finish("interrupted");
  };
  const request = () => ({
    signal: AbortSignal.any([streams.signal, AbortSignal.timeout(10_000)]),
  });
  const retry = async (work: () => Promise<void>, interval = 1000) => {
    while (!streams.signal.aborted) {
      try {
        await work();
      } catch (error) {
        if (!streams.signal.aborted)
          transportError =
            error instanceof Error ? error.message : String(error);
      }
      await delay(interval, undefined, { signal: streams.signal }).catch(
        () => {},
      );
    }
  };
  // Both streams are live connections with no automatic client reconnection.
  const live = retry(async () => {
    for await (const event of client.event.subscribe({
      signal: streams.signal,
    })) {
      consume(event);
      if (event.type === "permission.asked")
        await client.permission.reply(
          {
            sessionID: event.data.sessionID,
            requestID: event.data.id,
            reply: "once",
          },
          request(),
        );
      if (event.type === "form.created")
        await client.form.cancel(
          {
            sessionID: event.data.form.sessionID,
            formID: event.data.form.id,
          },
          request(),
        );
      if (streams.signal.aborted) break;
    }
  });
  let after = input.after;
  const log = retry(async () => {
    for await (const event of client.session.log(
      { sessionID: root.id, follow: true, after },
      { signal: streams.signal },
    )) {
      consume(event);
      // Advance only from log delivery, never from the possibly gapped live bus.
      if ("durable" in event) after = event.durable.seq;
      if (streams.signal.aborted) break;
    }
  });
  // A stream can remain open but miss its terminal event. A fresh session has
  // no previous outcome, so its persisted outcome safely confirms this prompt.
  const status = retry(async () => {
    const info = await client.session.get({ sessionID: root.id }, request());
    if (!input.sessionId || info.time.idle !== root.time.idle)
      finish(info.outcome);
  }, 5000);
  const stop = () => {
    if (terminal || timedOut) return;
    stopped = true;
    void client.session
      .interrupt({ sessionID: root.id }, request())
      .catch(() => {});
    stopDeadline = setTimeout(() => {
      streams.abort();
      done.resolve();
    }, 10_000);
  };
  input.signal?.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    void client.session
      .interrupt({ sessionID: root.id }, request())
      .catch(() => {});
  }, input.timeoutMs);
  const hardStop = setTimeout(() => {
    streams.abort();
    done.resolve();
  }, input.timeoutMs + 10_000);
  try {
    if (input.signal?.aborted) {
      stopped = true;
      streams.abort();
      done.resolve();
    } else
      await client.session.prompt(
        { sessionID: root.id, text: input.prompt },
        request(),
      );
    await done.promise;
  } catch (error) {
    // Admission can succeed even when its HTTP response is lost. Do not send
    // the prompt again; the streams/outcome check determine what happened.
    if (!terminal) {
      transportError = error instanceof Error ? error.message : String(error);
      await done.promise;
    }
  } finally {
    clearTimeout(timer);
    clearTimeout(hardStop);
    clearTimeout(stopDeadline);
    input.signal?.removeEventListener("abort", stop);
    streams.abort();
    await Promise.all([live, log, status]);
  }
  if (recordingError) throw recordingError;
  const sessions: RecordedSession[] = [];
  for (const id of ids) {
    // Replay is durable and deduplicated. It also fills tail events missed by the live bus.
    for await (const event of client.session.log(
      {
        sessionID: id,
        follow: false,
      },
      { signal: AbortSignal.timeout(30_000) },
    ))
      consume(event);
    sessions.push({
      info: await client.session.get(
        { sessionID: id },
        { signal: AbortSignal.timeout(30_000) },
      ),
      messages: await client.session.context(
        { sessionID: id },
        { signal: AbortSignal.timeout(30_000) },
      ),
    });
  }
  const rootMessages = sessions.find(
    (session) => session.info.id === root.id,
  )!.messages;
  const text = lastResponse(rootMessages);
  const stats = await client.session
    .stats({ tools: "none" }, { signal: AbortSignal.timeout(10_000) })
    .catch(() => undefined);
  return {
    sessions,
    text,
    tools: [...tools.values()],
    state: timedOut
      ? "timed_out"
      : terminal === "succeeded"
        ? "completed"
        : stopped
          ? "stopped"
          : "failed",
    error: timedOut
      ? "Session exceeded its time limit"
      : terminal === "succeeded"
        ? undefined
        : stopped
          ? undefined
          : (failure ??
            (terminal === "interrupted"
              ? "Session interrupted"
              : (transportError ?? "Session did not complete"))),
    accounting: stats
      ? {
          costUSD: stats.cost,
          sessions: stats.sessions,
          steps: stats.steps,
          tokens: stats.tokens,
        }
      : undefined,
  };
}

export const lastResponse = (messages: SessionMessageInfo[]) =>
  messages
    .filter((message) => message.type === "assistant")
    .map((message) =>
      message.content
        .filter((content) => content.type === "text")
        .map((content) => content.text)
        .join("\n\n"),
    )
    .filter(Boolean)
    .at(-1) ?? "";
