import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type {
  BenchmarkDefinition,
  ModelRef,
  PreparationStep,
  SessionArchive,
  EvidenceRef,
  OpenCodeStreamEvent,
} from "../../types";
import { CandidateContainer } from "./oci";
import { EvidenceCapture } from "../evidence";
import { createSessionDatabase, OPENCODE_VERSION } from "../opencode/host";
import { credentialsFor, removeCredentials } from "../opencode/auth";
import { candidateModels } from "../opencode/candidate";
import { runSession, clientFor, type SessionResult } from "../opencode/session";
import { readArchivedSession } from "../opencode/archive";
import { hash, errorMessage, writeJson } from "../files";
import type { EvidenceFeed } from "../../evidence";
import { readDurableCheckpoint } from "../opencode/checkpoint";

type CandidateInput = BenchmarkDefinition["candidate"] & {
  model: ModelRef;
  prompt: string;
  workspace: string;
  prepare: readonly PreparationStep[];
  container: BenchmarkDefinition["container"];
  imageId: string;
};
type CandidateResult = {
  state: "completed" | "stopped" | "failed" | "timed_out";
  session?: SessionArchive;
  evidence?: EvidenceRef;
  error?: string;
};

/** Owns the container and transport. Judge data cannot enter this interface. */
export async function executeCandidate(
  input: CandidateInput,
  directory: string,
  onEvent: (event: OpenCodeStreamEvent) => void,
  controls: {
    signal?: AbortSignal;
    onEvidence?: (feed: EvidenceFeed) => void;
  } = {},
): Promise<CandidateResult> {
  await mkdir(directory, { recursive: true });
  const staging = await mkdtemp(
    resolve(process.env.TMP ?? tmpdir(), "session-"),
  );
  let container: CandidateContainer | undefined,
    captured = false,
    rootId: string | undefined;
  let outcome: SessionResult | undefined;
  let capture: EvidenceCapture | undefined;
  try {
    const seedDatabase = resolve(staging, "opencode.db");
    await createSessionDatabase(
      seedDatabase,
      credentialsFor(candidateModels(input.model, input), input.websearch),
    );
    container = await CandidateContainer.create(input.container, input.imageId);
    await container.prepare(
      input.workspace,
      seedDatabase,
      input,
      input.prepare,
      staging,
    );
    const initial = resolve(staging, "initial");
    await container.snapshot(initial, staging);
    capture = await EvidenceCapture.create(
      resolve(directory, "evidence"),
      initial,
      { excludeDirectories: ["node_modules"] },
    );
    const recorded = new Set<string>();
    let recordingError: unknown;
    const record = (event: OpenCodeStreamEvent) => {
      if (!("id" in event) || recorded.has(event.id)) return;
      if (event.type === "session.created" && !event.data.parentID)
        rootId ??= event.data.sessionID;
      try {
        capture!.event(event);
        onEvent(event);
        recorded.add(event.id);
      } catch (error) {
        recordingError = error;
        throw error;
      }
    };
    const url = await container.start(input.timeoutMs);
    const client = clientFor(url, container.password);
    let transportError: string | undefined;
    try {
      outcome = await runSession(
        client,
        {
          model: input.model,
          agent: input.agent,
          prompt: input.prompt,
          directory: "/workspace",
          timeoutMs: input.timeoutMs,
          signal: controls.signal,
          onCreated: (id) => {
            rootId = id;
            controls.onEvidence?.(
              capture!.feed(input.prompt, (cutoff, signal) =>
                readDurableCheckpoint(client, id, cutoff, signal, record),
              ),
            );
          },
        },
        record,
      );
    } catch (error) {
      if (recordingError || !rootId) throw error;
      transportError = errorMessage(error);
      // The independent server deadline can close HTTP before final reads.
      // Read the stopped, scrubbed database before deciding the outcome.
    }
    const deadlineExpired =
      container.deadlineAt !== undefined && Date.now() >= container.deadlineAt;
    capture.close();
    await container.stop();
    const database = resolve(directory, "opencode.db");
    await container.saveDatabase(database);
    removeCredentials(database);
    if (!outcome || controls.onEvidence) {
      const archived = await readArchivedSession(database, rootId!, record);
      const previous = outcome;
      outcome = previous
        ? { ...archived.result, state: previous.state, error: previous.error }
        : archived.result;
      if (!archived.outcome) outcome.error = transportError ?? outcome.error;
      if (
        !previous &&
        (archived.outcome === "interrupted" || !archived.outcome) &&
        deadlineExpired
      ) {
        outcome.state = "timed_out";
        outcome.error = "Candidate session exceeded its time limit";
      } else if (
        !previous &&
        (archived.outcome === "interrupted" || !archived.outcome) &&
        controls.signal?.aborted
      ) {
        outcome.state = "stopped";
        outcome.error = undefined;
      }
    }
    const final = resolve(directory, "workspace");
    await container.snapshot(final, staging);
    await writeJson(resolve(directory, "session.json"), outcome.sessions);
    const manifest = await capture.finish({
      prompt: input.prompt,
      response: { text: outcome.text },
      tools: outcome.tools,
      workspace: final,
    });
    const session: SessionArchive = {
      sessionId: outcome.sessions[0]!.info.id,
      database: "opencode.db",
      databaseHash: hash(await Bun.file(database).bytes()),
      opencodeVersion: OPENCODE_VERSION,
      accounting: outcome.accounting,
    };
    captured = true;
    return {
      state: outcome.state,
      session,
      evidence: { directory: "evidence", hash: manifest.sha256 },
      error: outcome.error,
    };
  } catch (error) {
    await container?.stop().catch(() => {});
    let session: SessionArchive | undefined;
    if (container) {
      const database = resolve(directory, "opencode.db");
      try {
        await container.saveDatabase(database);
        removeCredentials(database);
        if (rootId)
          session = {
            sessionId: rootId,
            database: "opencode.db",
            databaseHash: hash(await Bun.file(database).bytes()),
            opencodeVersion: OPENCODE_VERSION,
            accounting: outcome?.accounting,
          };
      } catch (archiveError) {
        await writeJson(resolve(directory, "archive-error.json"), {
          error: errorMessage(archiveError),
        });
      }
    }
    if (outcome)
      await writeJson(resolve(directory, "candidate-checkpoint.json"), outcome);
    return {
      state: "failed",
      session,
      error: `${errorMessage(error)}${container ? ` (workspace retained in ${container.name})` : ""}`,
    };
  } finally {
    capture?.close();
    if (captured) await container?.close();
    await rm(staging, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
}
