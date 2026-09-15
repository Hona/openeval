import type { OpenCodeStreamEvent, ToolCall } from "../../types";

/** Project native tool events without depending on an execution client. */
export function trackTool(
  calls: Map<string, ToolCall>,
  event: OpenCodeStreamEvent,
) {
  if (!("data" in event)) return;
  const data = event.data as {
    id?: string;
    sessionID?: string;
    name?: string;
    assistantMessageID?: string;
    input?: Record<string, unknown>;
    text?: string;
    content?: unknown;
    error?: unknown;
    executed?: boolean;
  };
  if (!data.id) return;
  const key = `${data.sessionID ?? ""}:${data.assistantMessageID ?? ""}:${data.id}`;
  const value = calls.get(key) ?? {
    id: data.id,
    sessionID: data.sessionID,
    name: data.name ?? "unknown",
    assistantMessageId: data.assistantMessageID ?? "",
    status: "preparing" as const,
  };
  if (event.type === "session.tool.input.started") {
    value.name = data.name!;
    value.startedAt = event.created;
  }
  if (event.type === "session.tool.input.ended") value.rawInput = data.text;
  if (event.type === "session.tool.called") {
    value.input = data.input;
    value.status = "called";
  }
  if (
    event.type === "session.tool.success" ||
    event.type === "session.tool.failed"
  ) {
    value.status =
      event.type === "session.tool.success" ? "succeeded" : "failed";
    value.content = data.content;
    value.error = data.error;
    value.executed = data.executed;
    value.completedAt = event.created;
    if (value.startedAt !== undefined)
      value.durationMs = event.created - value.startedAt;
  }
  calls.set(key, value);
}
