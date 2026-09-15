import type { EvidenceQuery } from "./evidence";
import type { ToolCall } from "./types";
import type { RunMetrics } from "./judge-context";

/** Complete evidence values, independent of storage, HTTP, and viewer publication. */
export type EvidenceDocument = {
  summary: Record<string, unknown>;
  metrics: RunMetrics;
  response: string;
  messages: Array<{
    id: string;
    sessionID: string;
    role: string;
    text: string;
    firstSequence: number;
    lastSequence: number;
    complete: boolean;
  }>;
  events: Array<{
    sequence: number;
    time: string;
    event: { type: string; data: Record<string, unknown> };
  }>;
  tools: ToolCall[];
  artifacts: {
    initial: Array<{
      path: string;
      bytes: number;
      sha256?: string;
      text: string;
    }>;
    final: Array<{
      path: string;
      bytes: number;
      sha256?: string;
      text: string;
    }>;
  };
};

const offsetOf = (input: EvidenceQuery) => {
  const offset = input.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new Error("offset must be a non-negative integer");
  return offset;
};
const limitOf = (input: EvidenceQuery, max: number, fallback: number) => {
  const limit = input.limit ?? fallback;
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new Error("limit must be a positive integer");
  return Math.min(limit, max);
};
export const evidencePage = <T>(items: T[], input: EvidenceQuery) => {
  const offset = offsetOf(input),
    end = Math.min(items.length, offset + limitOf(input, 100, 20));
  return {
    items: items.slice(offset, end),
    total: items.length,
    next: end < items.length ? end : null,
  };
};
export const evidenceTextPage = (text: string, input: EvidenceQuery) => {
  const offset = offsetOf(input),
    end = Math.min(text.length, offset + limitOf(input, 24000, 8000));
  return {
    text: text.slice(offset, end),
    totalCharacters: text.length,
    next: end < text.length ? end : null,
  };
};

/** Query complete values. Public callers supply a separately filtered document. */
export function queryEvidenceDocument(
  data: EvidenceDocument,
  input: EvidenceQuery,
): Record<string, unknown> {
  if (input.action === "summary") return data.summary;
  if (input.action === "metrics") {
    if (!input.metric) return { ...data.metrics };
    let value: unknown = data.metrics;
    for (const key of input.metric.split(".")) {
      if (!value || typeof value !== "object" || !Object.hasOwn(value, key))
        throw new Error(`Unknown recorded metric: ${input.metric}`);
      value = (value as Record<string, unknown>)[key];
    }
    return { metric: input.metric, value, evidence: data.metrics.evidence };
  }
  if (input.action === "response")
    return evidenceTextPage(data.response, input);
  if (input.action === "messages")
    return evidencePage(
      data.messages
        .filter(
          (message) =>
            !input.sessionID || message.sessionID === input.sessionID,
        )
        .map(({ text, ...message }) => ({
          ...message,
          characters: text.length,
          preview: text.slice(0, 800),
        })),
      input,
    );
  if (input.action === "message") {
    const message = data.messages.find((message) => message.id === input.id);
    if (!message) throw new Error("Unknown message ID");
    return { ...message, ...evidenceTextPage(message.text, input) };
  }
  if (input.action === "events")
    return evidencePage(
      data.events
        .filter(
          ({ event }) =>
            (!input.sessionID || event.data.sessionID === input.sessionID) &&
            (!input.type || event.type.startsWith(input.type)),
        )
        .map(({ sequence, time, event }) => ({
          sequence,
          time,
          type: event.type,
          sessionID: event.data.sessionID,
          preview: JSON.stringify(event.data).slice(0, 500),
        })),
      input,
    );
  if (input.action === "event") {
    const event = data.events.find(
      (event) => String(event.sequence) === input.id,
    );
    if (!event) throw new Error("Unknown event sequence; supply it as id");
    return evidenceTextPage(JSON.stringify(event, null, 2), input);
  }
  if (input.action === "tools")
    return evidencePage(
      data.tools.map(({ id, name, status, startedAt, completedAt }) => ({
        id,
        name,
        status,
        startedAt,
        completedAt,
      })),
      input,
    );
  if (input.action === "tool") {
    const tool = data.tools.find((tool) => tool.id === input.id);
    if (!tool) throw new Error("Unknown tool call ID");
    return evidenceTextPage(JSON.stringify(tool, null, 2), input);
  }
  const artifact = (revision: "initial" | "final") =>
    data.artifacts[revision].find((file) => file.path === input.path);
  if (input.action === "artifacts")
    return evidencePage(
      data.artifacts[input.revision ?? "final"]
        .filter((file) => !input.path || file.path.startsWith(input.path))
        .map(({ text, ...file }) => file),
      input,
    );
  if (input.action === "artifact") {
    const file = artifact(input.revision ?? "final");
    if (!file)
      throw new Error("Artifact is not included in this evidence document");
    const { text, ...entry } = file;
    return { ...entry, encoding: "utf8", ...evidenceTextPage(text, input) };
  }
  if (input.action === "diff") {
    const render = (file: ReturnType<typeof artifact>) => {
      if (!file) return null;
      const { text, ...entry } = file;
      return { ...entry, ...evidenceTextPage(text, input) };
    };
    const initial = artifact("initial"),
      final = artifact("final");
    if (!initial && !final)
      throw new Error("Artifact is not included in this evidence document");
    return { initial: render(initial), final: render(final) };
  }
  throw new Error("Unknown evidence action");
}
