import { OpenCode } from "@opencode/sdk";
import { dirname, resolve } from "node:path";
import type { SessionInfo } from "@opencode/client";
import type { OpenCodeStreamEvent, ToolCall } from "../../types";
import {
  lastResponse,
  trackTool,
  type RecordedSession,
  type SessionResult,
} from "./session";

/** Read the stopped database through native APIs, with no prompts or live transport. */
export async function readArchivedSession(
  database: string,
  rootId: string,
  onEvent: (event: OpenCodeStreamEvent) => void,
) {
  await using host = await OpenCode.create({
    database: { path: database },
    config: {
      directory: resolve(dirname(database), "archive-configuration"),
      project: false,
      content: JSON.stringify({ websearch: false }),
    },
  });
  const sessions: RecordedSession[] = [];
  const ids = new Set([rootId]);
  const tools = new Map<string, ToolCall>();
  let outcome: SessionInfo["outcome"], error: string | undefined;
  for (const id of ids) {
    if (id === rootId) {
      let cursor: string | undefined;
      do {
        const children = await host.session.list({ limit: 100, cursor });
        for (const child of children.data) ids.add(child.id);
        cursor = children.cursor.next ?? undefined;
      } while (cursor);
    }
    for await (const event of host.session.log({
      sessionID: id,
      follow: false,
    })) {
      onEvent(event);
      if (event.type.startsWith("session.tool.")) trackTool(tools, event);
      if (id !== rootId) continue;
      if (event.type === "session.execution.succeeded") outcome = "succeeded";
      if (event.type === "session.execution.interrupted")
        outcome = "interrupted";
      if (event.type === "session.execution.failed") {
        outcome = "failed";
        error = event.data.error.message;
      }
    }
    sessions.push({
      info: await host.session.get({ sessionID: id }),
      messages: await host.session.context({ sessionID: id }),
    });
  }
  outcome ??= sessions[0].info.outcome;
  const stats = await host.session.stats({ tools: "none" });
  const result: SessionResult = {
    sessions,
    text: lastResponse(sessions[0].messages),
    tools: [...tools.values()],
    state: outcome === "succeeded" ? "completed" : "failed",
    error:
      outcome === "succeeded"
        ? undefined
        : (error ??
          (outcome === "interrupted"
            ? "Session interrupted"
            : "Session did not complete")),
    accounting: {
      costUSD: stats.cost,
      sessions: stats.sessions + stats.subagents,
      steps: stats.steps,
      tokens: stats.tokens,
    },
  };
  return { result, outcome };
}
