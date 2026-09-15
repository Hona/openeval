import { OpenCode } from "@opencode/sdk";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { EvidenceView, JudgeSession } from "../../evidence";
import type {
  EarlyDecision,
  JudgeRunInput,
  OpenCodeStreamEvent,
  SessionArchive,
} from "../../types";
import type { EvidenceQueryAudit } from "../evidence";
import { credentialsFor, removeCredentials } from "../opencode/auth";
import { createSessionDatabase, OPENCODE_VERSION } from "../opencode/host";
import { runSession } from "../opencode/session";
import { readArchivedSession } from "../opencode/archive";
import { hash, writeJson } from "../files";
import { installJudgeTools } from "./tools";
import type { JudgeRequest, SubmissionAudit } from "./submission";
import { judgeConfiguration, judgePrompt } from "./agent";

/** Persistent native judge session. It can read evidence and decide, but cannot stop an eval. */
export async function createJudgeSession(
  input: Pick<
    JudgeRunInput,
    "model" | "rubric" | "timeoutMs" | "websearch" | "criteria" | "agent"
  >,
  directory: string,
  onEvent: (event: OpenCodeStreamEvent) => void,
): Promise<
  JudgeSession & {
    setCheck(id: string): void;
    close(): Promise<SessionArchive | undefined>;
  }
> {
  if (!input.model || !input.agent)
    throw new Error("Monitoring requires an LLM judge configuration");
  const model = input.model,
    agent = input.agent;
  await mkdir(directory, { recursive: true });
  const database = resolve(directory, "opencode.db");
  await createSessionDatabase(database, credentialsFor(model, input.websearch));
  let host: Awaited<ReturnType<typeof OpenCode.create>>;
  try {
    host = await OpenCode.create({
      database: { path: database },
      events: { persist: true },
      config: await judgeConfiguration(input, directory),
    });
  } catch (error) {
    removeCredentials(database);
    throw error;
  }
  const queries: EvidenceQueryAudit[] = [];
  const submissions: SubmissionAudit[] = [];
  let checkId: string | undefined;
  let rootId: string | undefined,
    after: number | undefined,
    busy = false,
    closed = false;
  const recorded = new Set<string>();
  let tools: Awaited<ReturnType<typeof installJudgeTools>>;
  try {
    tools = await installJudgeTools(
      host,
      directory,
      input,
      queries,
      submissions,
    );
  } catch (error) {
    await host.close();
    removeCredentials(database);
    throw error;
  }
  const invoke = async (
    evidence: EvidenceView,
    signal: AbortSignal,
    purpose: "early" | "final",
  ) => {
    signal.throwIfAborted();
    if (busy || closed) throw new Error("Judge session is busy or closed");
    busy = true;
    let request: JudgeRequest | undefined;
    try {
      request = await tools.open(evidence, purpose, signal, checkId);
      const result = await runSession(
        host,
        {
          model,
          agent: agent.id,
          directory,
          timeoutMs: input.timeoutMs,
          signal,
          sessionId: rootId,
          after,
          prompt: judgePrompt(purpose),
        },
        (event) => {
          if (event.type === "session.created" && !event.data.parentID)
            rootId ??= event.data.sessionID;
          if ("durable" in event && event.durable.aggregateID === rootId)
            after = Math.max(after ?? -1, event.durable.seq);
          if (!("id" in event) || recorded.has(event.id)) return;
          recorded.add(event.id);
          onEvent(event);
        },
      );
      rootId ??= result.sessions[0]?.info.id;
      if (result.state !== "completed") {
        signal.throwIfAborted();
        throw new Error(result.error ?? `Judge ${result.state}`);
      }
      return request.result();
    } finally {
      request?.close();
      busy = false;
      await writeJson(resolve(directory, "evidence-queries.json"), queries);
      await writeJson(
        resolve(directory, "judgment-submissions.json"),
        submissions,
      );
    }
  };
  return {
    setCheck: (id) => {
      checkId = id;
    },
    check: async (evidence, signal) => {
      const decision = await invoke(evidence, signal, "early");
      if (decision.kind === "continue") return decision;
      if (decision.judgment.value === null)
        throw new Error("Early judgments must be fully decided");
      return {
        ...decision,
        judgment: { ...decision.judgment, value: decision.judgment.value },
      } satisfies EarlyDecision;
    },
    grade: async (evidence, signal) => {
      const decision = await invoke(evidence, signal, "final");
      if (decision.kind !== "decided")
        throw new Error("Final grading requires a judgment submission");
      return decision.judgment;
    },
    close: async () => {
      if (closed) throw new Error("Judge archive already finalized");
      closed = true;
      try {
        await host.close();
      } finally {
        removeCredentials(database);
      }
      await writeJson(resolve(directory, "evidence-queries.json"), queries);
      await writeJson(
        resolve(directory, "judgment-submissions.json"),
        submissions,
      );
      if (!rootId) return undefined;
      const { result } = await readArchivedSession(database, rootId, () => {});
      await writeJson(resolve(directory, "session.json"), result.sessions);
      return {
        sessionId: rootId,
        database: "opencode.db",
        databaseHash: hash(await Bun.file(database).bytes()),
        opencodeVersion: OPENCODE_VERSION,
        accounting: result.accounting,
      };
    },
  };
}
