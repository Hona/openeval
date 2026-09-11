import type {
  JsonValue,
  ModelRef,
  SessionMessageAssistant,
  SessionMessageAssistantTool,
  SessionStructuredError,
  ToolContent,
} from "@opencode/client";
import type { RunEvent } from "./types";
import type { RecordedSession, SessionStage } from "./view";
export type { RecordedSession, SessionStage, SessionSnapshot } from "./view";

export const emptyStage = (): SessionStage => ({
  prompt: "",
  model: "",
  sessions: [],
});
export const sessionModel = (ref: string): ModelRef => {
  const [model, variant] = ref.split("#"),
    slash = model.indexOf("/");
  return {
    providerID: slash < 0 ? "recorded" : model.slice(0, slash),
    id: slash < 0 ? model : model.slice(slash + 1),
    variant,
  };
};
const object = (value: unknown): Record<string, JsonValue> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
const toolContent = (value: unknown): [ToolContent, ...ToolContent[]] => {
  const items = (Array.isArray(value) ? value : []).filter(
    (item): item is ToolContent =>
      !!item &&
      typeof item === "object" &&
      ((item.type === "text" && typeof item.text === "string") ||
        (item.type === "file" &&
          typeof item.uri === "string" &&
          typeof item.mime === "string")),
  );
  return items.length
    ? (items as [ToolContent, ...ToolContent[]])
    : [
        {
          type: "text",
          text: typeof value === "string" ? value : JSON.stringify(value ?? ""),
        },
      ];
};
const structuredError = (value: unknown): SessionStructuredError => {
  const data = object(value);
  return {
    type: typeof data.type === "string" ? data.type : "RecordedError",
    message:
      typeof data.message === "string"
        ? data.message
        : String(value ?? "Unknown error"),
  };
};

/** Incremental native event projection. Completed views use the authoritative session context. */
export function applySessionRecord(stage: SessionStage, record: RunEvent) {
  if (!("data" in record.event)) return;
  const event = record.event,
    data = event.data as Record<string, unknown>,
    time = Date.parse(record.time);
  if (typeof data.sessionID !== "string") return;
  let session = stage.sessions.find(
    (session) => session.sessionID === data.sessionID,
  );
  if (!session) {
    session = {
      sessionID: data.sessionID,
      title: "",
      created: time,
      model: sessionModel(stage.model),
      agent: "build",
      messages: [],
      diffs: [],
      status: { type: "idle" },
      parts: {},
    };
    stage.sessions.push(session);
  }
  if (event.type === "session.created") {
    if (typeof data.parentID === "string") session.parentID = data.parentID;
    if (typeof data.agent === "string") session.agent = data.agent;
    if (typeof data.title === "string") session.title = data.title;
    if (data.model && typeof data.model === "object")
      session.model = data.model as ModelRef;
  }
  if (event.type === "session.renamed" && typeof data.title === "string")
    session.title = data.title;
  if (event.type === "session.execution.started")
    session.status = { type: "busy" };
  if (
    [
      "session.execution.succeeded",
      "session.execution.failed",
      "session.execution.interrupted",
    ].includes(event.type)
  )
    session.status = { type: "idle" };
  if (event.type === "session.inbox.enqueued") {
    const item = data.item as
      { type?: string; payload?: { text?: string } } | undefined;
    if (
      item?.type === "user" &&
      typeof item.payload?.text === "string" &&
      !session.messages.some((message) => message.id === data.inboxID)
    )
      session.messages.push({
        type: "user",
        id: String(data.inboxID),
        text: item.payload.text,
        time: { created: time },
      });
  }
  if (typeof data.assistantMessageID !== "string") return;
  let message = session.messages.find(
    (message): message is SessionMessageAssistant =>
      message.type === "assistant" && message.id === data.assistantMessageID,
  );
  if (!message) {
    message = {
      type: "assistant",
      id: data.assistantMessageID,
      time: { created: time },
      agent: session.agent,
      model: session.model,
      content: [],
    };
    session.messages.push(message);
  }
  if (event.type === "session.step.started") {
    message.agent = typeof data.agent === "string" ? data.agent : session.agent;
    message.model =
      data.model && typeof data.model === "object"
        ? (data.model as ModelRef)
        : session.model;
  }
  if (event.type === "session.step.streamed") message.time.streamed = time;
  if (event.type === "session.step.ended") {
    message.time.completed = time;
    message.finish = data.finish as SessionMessageAssistant["finish"];
  }
  const text = /^session\.(text|reasoning)\.(started|delta|ended)$/.exec(
    event.type,
  );
  if (text) {
    const type = text[1] as "text" | "reasoning",
      key = `${message.id}:${type}:${data.ordinal}`;
    let part = session.parts[key];
    if (!part) {
      part = {
        messageID: message.id,
        index: message.content.length,
        complete: false,
      };
      session.parts[key] = part;
      message.content.push(
        type === "reasoning"
          ? { type, text: "", time: { created: time } }
          : { type, text: "" },
      );
    }
    const content = message.content[part.index];
    if (content.type === "tool") return;
    if (text[2] === "delta" && !part.complete)
      content.text += String(data.delta ?? "");
    if (text[2] === "ended") {
      content.text = String(data.text ?? content.text);
      part.complete = true;
      if (content.type === "reasoning")
        content.time = {
          created: content.time?.created ?? time,
          completed: time,
        };
    }
  }
  if (!event.type.startsWith("session.tool.") || typeof data.id !== "string")
    return;
  let tool = message.content.find(
    (part): part is SessionMessageAssistantTool =>
      part.type === "tool" && part.id === data.id,
  );
  if (!tool) {
    tool = {
      type: "tool",
      id: data.id,
      name: String(data.name ?? "tool"),
      time: { created: time },
      state: { status: "streaming", input: "" },
    };
    message.content.push(tool);
  }
  if (typeof data.name === "string") tool.name = data.name;
  if (
    event.type === "session.tool.input.delta" &&
    tool.state.status === "streaming"
  )
    tool.state.input += String(data.delta ?? "");
  if (
    event.type === "session.tool.input.ended" &&
    tool.state.status === "streaming"
  )
    tool.state.input = String(data.text ?? "");
  if (event.type === "session.tool.called") {
    tool.state = { status: "running", input: object(data.input), metadata: {} };
    tool.time.ran = time;
  }
  if (
    event.type === "session.tool.progress" &&
    tool.state.status !== "streaming"
  )
    tool.state.metadata = object(data.metadata);
  if (
    event.type === "session.tool.success" ||
    event.type === "session.tool.failed"
  ) {
    const input = tool.state.status === "streaming" ? {} : tool.state.input,
      metadata = data.metadata
        ? object(data.metadata)
        : tool.state.status === "streaming"
          ? {}
          : tool.state.metadata;
    tool.state =
      event.type === "session.tool.success"
        ? {
            status: "completed",
            input,
            metadata,
            content: toolContent(data.content),
          }
        : {
            status: "error",
            input,
            metadata,
            error: structuredError(data.error),
            ...(data.content ? { content: toolContent(data.content) } : {}),
          };
    tool.time.completed = time;
  }
  if (typeof data.executed === "boolean") tool.executed = data.executed;
}
