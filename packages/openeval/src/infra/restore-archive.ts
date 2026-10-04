import { Database } from "bun:sqlite";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import type { BenchmarkDefinition, EvalDefinition, EvalRunInput, OpenCodeStreamEvent } from "../types";
import { EvidenceCapture } from "./evidence";
import { extractWorkspaceArchive } from "./containers/transfer";
import { removeCredentials } from "./opencode/auth";
import { readArchivedSession } from "./opencode/archive";
import { parseModel, type SessionResult } from "./opencode/session";
import { hash, writeJson } from "./files";
import { CandidateContainer } from "./containers/oci";
import { createSessionDatabase } from "./opencode/host";

export type ArchiveRestore = {
  database: string;
  databaseHash: string;
  workspaceArchive: string;
  workspaceArchiveHash: string;
};

/** Replay only frozen author preparation, without credentials or a model prompt. */
export async function prepareRestoredInitial(
  definition: BenchmarkDefinition,
  item: EvalDefinition,
  imageId: string,
  workspace: string,
  staging: string,
) {
  if (!item.settings.prepare?.length) return workspace;
  await mkdir(staging, { recursive: true });
  const database = resolve(staging, "opencode.db");
  await createSessionDatabase(database, []);
  await using container = await CandidateContainer.create(definition.container, imageId);
  await container.prepare(workspace, database, definition.candidate.websearch,
    item.settings.prepare, staging);
  const initial = resolve(staging, "workspace");
  await container.snapshot(initial, staging);
  return initial;
}

/** A backup must belong to the original execution, not merely resemble its answer. */
export function verifyArchivedInput(
  input: EvalRunInput,
  sessionId: string,
  archived: { result: SessionResult; outcome: string | undefined },
) {
  const root = archived.result.sessions.find(session => session.info.id === sessionId);
  const model = parseModel(input.model);
  const prompt = root?.messages.find(message => message.type === "user")?.text;
  if (!root || root.info.parentID || root.info.model?.providerID !== model.providerID ||
      root.info.model?.id !== model.id || root.info.model?.variant !== model.variant ||
      prompt !== input.prompt)
    throw new Error("The native backup does not match the original session, model, and prompt");
  if (archived.outcome !== "succeeded" || archived.result.state !== "completed")
    throw new Error("Restore requires a naturally completed native session");
}

/** Finalize a copied native recording. No candidate program, prompt, or model runs. */
export async function restoreArchivedCandidate(
  input: EvalRunInput,
  sessionId: string,
  initialWorkspace: string,
  options: ArchiveRestore,
  directory: string,
) {
  for (const [file, expected] of [
    [options.database, options.databaseHash],
    [options.workspaceArchive, options.workspaceArchiveHash],
  ]) {
    if (!/^[a-f0-9]{64}$/.test(expected!) || hash(await Bun.file(file!).bytes()) !== expected)
      throw new Error("The recovery backup hash does not match");
  }
  if (Bun.file(options.workspaceArchive).size > 256 * 1024 * 1024)
    throw new Error("The recovery workspace archive exceeds 256 MiB");
  const staging = await mkdtemp(resolve(dirname(directory), ".restore-"));
  try {
    await mkdir(directory, { recursive: true });
    const database = resolve(directory, "opencode.db");
    // SQLite serialization includes committed WAL pages without modifying the backup.
    using source = new Database(options.database, { readonly: true });
    await Bun.write(database, source.serialize());
    removeCredentials(database);
    const events: OpenCodeStreamEvent[] = [];
    const archived = await readArchivedSession(database, sessionId, event => events.push(event));
    verifyArchivedInput(input, sessionId, archived);
    const creation = events.find((event): event is Extract<OpenCodeStreamEvent, { type: "session.created" }> =>
      event.type === "session.created" && event.data.sessionID === sessionId);
    if (!creation) throw new Error("The native backup has no root creation event");
    const completedAt = archived.result.sessions.find(session => session.info.id === sessionId)!.info.time.idle;
    if (typeof completedAt !== "number" || !Number.isFinite(completedAt))
      throw new Error("The native session has no completion timestamp");
    removeCredentials(database);
    const workspace = resolve(staging, "workspace");
    await mkdir(workspace);
    await extractWorkspaceArchive(options.workspaceArchive, workspace, { sourceRoot: "/workspace" });
    const capture = await EvidenceCapture.create(resolve(directory, "evidence"), initialWorkspace,
      { excludeDirectories: ["node_modules"] });
    for (const event of events)
      capture.event(event, new Date("created" in event ? event.created : Date.now()).toISOString());
    const manifest = await capture.finish({
      prompt: input.prompt,
      response: { text: archived.result.text },
      tools: archived.result.tools,
      workspace,
    });
    await writeJson(resolve(directory, "session.json"), archived.result.sessions);
    const receipt = {
      sessionId,
      restoredAt: new Date().toISOString(),
      completedAt: new Date(completedAt).toISOString(),
      databaseHash: options.databaseHash,
      workspaceArchiveHash: options.workspaceArchiveHash,
      initial: "frozen input and author preparation replayed without model calls; not a newly observed candidate snapshot",
    };
    await writeJson(resolve(directory, "restoration.json"), receipt);
    return {
      evidence: { directory: "evidence", hash: manifest.sha256 },
      session: {
        sessionId,
        database: "opencode.db",
        databaseHash: hash(await Bun.file(database).bytes()),
        opencodeVersion: creation.data.version,
        accounting: archived.result.accounting,
      },
      events,
      tools: archived.result.tools,
      receipt,
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
