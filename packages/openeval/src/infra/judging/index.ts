import { OpenCode } from "@opencode/sdk";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type {
  JudgeRunInput,
  SessionArchive,
  Judgment,
  OpenCodeStreamEvent,
} from "../../types";
import { CandidateEvidence, type EvidenceQueryAudit } from "../evidence";
import { credentialsFor, removeCredentials } from "../opencode/auth";
import { createSessionDatabase, OPENCODE_VERSION } from "../opencode/host";
import { runSession, type SessionResult } from "../opencode/session";
import { hash, writeJson, fingerprint, treeHash } from "../files";
import { installJudgeTools } from "./tools";
import type { SubmissionAudit } from "./submission";
import { judgeConfiguration, judgePrompt } from "./agent";

export const judgingFingerprint = async () =>
  fingerprint({
    sdk: OPENCODE_VERSION,
    bun: Bun.version,
    implementation: await treeHash(
      fileURLToPath(new URL("./", import.meta.url)),
      { ignore: /\.test\.[jt]sx?$/ },
    ),
    session: await treeHash(
      fileURLToPath(new URL("../opencode/", import.meta.url)),
      { ignore: /\.test\.[jt]sx?$/ },
    ),
    recording: await treeHash(
      fileURLToPath(new URL("../recording/", import.meta.url)),
      { ignore: /\.test\.[jt]sx?$/ },
    ),
    context: await Bun.file(
      fileURLToPath(new URL("../../judge-context.ts", import.meta.url)),
    ).text(),
    composition: await Bun.file(
      fileURLToPath(new URL("../../app/grade-recording.ts", import.meta.url)),
    ).text(),
    useCase: await Bun.file(
      fileURLToPath(new URL("../../app/judge-run.ts", import.meta.url)),
    ).text(),
  });

export async function executeJudge(
  input: JudgeRunInput,
  directory: string,
  onEvent: (event: OpenCodeStreamEvent) => void,
) {
  if (!input.model || !input.agent || !input.criteria.length)
    throw new Error(
      "An LLM judge requires a model, agent, and declared criteria",
    );
  await mkdir(directory, { recursive: true });
  const evidence = await CandidateEvidence.open(
    input.evidence.directory,
    input.evidence.hash,
  );
  const database = resolve(directory, "opencode.db");
  await createSessionDatabase(
    database,
    credentialsFor(input.model, input.websearch),
  );
  const queries: EvidenceQueryAudit[] = [];
  let result: SessionResult | undefined, judgment: Judgment | undefined;
  const submissions: SubmissionAudit[] = [];
  try {
    await using opencode = await OpenCode.create({
      database: { path: database },
      events: { persist: true },
      config: await judgeConfiguration(input, directory),
    });
    const tools = await installJudgeTools(
      opencode,
      directory,
      input,
      queries,
      submissions,
    );
    const request = await tools.open(evidence.view(input.evidence), "final");
    try {
      result = await runSession(
        opencode,
        {
          model: input.model,
          agent: input.agent.id,
          directory,
          timeoutMs: input.timeoutMs,
          prompt: judgePrompt("final"),
        },
        onEvent,
      );
      if (result.state !== "completed")
        throw new Error(result.error ?? `Judge ${result.state}`);
      const decision = request.result();
      if (decision.kind !== "decided")
        throw new Error("Final grading requires a judgment submission");
      judgment = decision.judgment;
    } catch (error) {
      if (!result) throw error;
      result = {
        ...result,
        state: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      request.close();
    }
  } finally {
    removeCredentials(database);
    await writeJson(resolve(directory, "evidence-queries.json"), queries);
    await writeJson(
      resolve(directory, "judgment-submissions.json"),
      submissions,
    );
  }
  if (!result) throw new Error("Judge did not produce an execution record");
  await writeJson(resolve(directory, "session.json"), result.sessions);
  const session: SessionArchive = {
    sessionId: result.sessions[0]!.info.id,
    database: "opencode.db",
    databaseHash: hash(await Bun.file(database).bytes()),
    opencodeVersion: OPENCODE_VERSION,
    accounting: result.accounting,
  };
  return { result, session, judgment };
}
