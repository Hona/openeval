import { Database } from "bun:sqlite";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { OpenCode } from "@opencode/sdk";
import type {
  JudgeContext,
  RecordedMessage,
  Revision,
} from "../../judge-context";
import type { EvalRun, EvidenceRef } from "../../types";
import { CandidateEvidence } from "../evidence";
import { contained, hash } from "../files";
import { OPENCODE_VERSION } from "../opencode/version";
import { measureRecording } from "./metrics";

export type RecordingInput = {
  evidence: EvidenceRef;
  run?: EvalRun;
  runDirectory?: string;
};

/** Own disposable native readers; the authoritative archive is only read. */
export async function openRecording(
  input: RecordingInput,
  workDirectory: string,
): Promise<JudgeContext & AsyncDisposable> {
  const reference = {
    ...input.evidence,
    directory: resolve(input.evidence.directory),
  };
  const evidence = await CandidateEvidence.open(
    reference.directory,
    reference.hash,
  );
  const events = evidence.rawEvents(),
    tools = evidence.toolCalls(),
    run = input.run ?? null;
  const metrics = measureRecording(events, tools, reference);
  const archive = run?.session;
  const rootID = archive?.sessionId ?? null;
  let temporary: Promise<string> | undefined,
    database: Promise<Database> | undefined;
  let sdk: Promise<OpenCode.Interface> | undefined;
  const temp = () =>
    (temporary ??= (async () => {
      await mkdir(workDirectory, { recursive: true });
      return mkdtemp(resolve(workDirectory, "recording-"));
    })());
  const copyDatabase = async (name: string) => {
    if (!archive || !input.runDirectory)
      throw new Error("This recording has no native OpenCode database");
    const bytes = await Bun.file(
      resolve(input.runDirectory, archive.database),
    ).bytes();
    if (hash(bytes) !== archive.databaseHash)
      throw new Error("Native OpenCode database hash mismatch");
    const path = resolve(await temp(), name);
    await Bun.write(path, bytes);
    return path;
  };
  const nativeSDK = () =>
    (sdk ??= (async () => {
      const path = await copyDatabase("sdk.db");
      const { OpenCode } = await import("@opencode/sdk");
      return OpenCode.create({
        database: { path },
        config: {
          directory: resolve(dirname(path), "configuration"),
          project: false,
          content: JSON.stringify({ websearch: false }),
        },
      });
    })());
  const sessions = async () => {
    const host = await nativeSDK();
    const records = [];
    let cursor: string | undefined;
    do {
      const page = await host.session.list({ limit: 100, cursor });
      records.push(...page.data);
      cursor = page.cursor.next ?? undefined;
    } while (cursor);
    return records;
  };
  const readText = async (path: string, revision: Revision = "final") =>
    new TextDecoder("utf-8", { fatal: true }).decode(
      await evidence.readFile(path, revision),
    );
  return {
    response: { text: evidence.manifest.response?.text ?? "" },
    prompt: evidence.manifest.prompt,
    run: run ? structuredClone(run) : null,
    metrics: structuredClone(metrics),
    recording: {
      evidence: reference,
      sessionID: rootID,
      coverage: evidence.manifest.coverage,
      events: (filter = {}) =>
        structuredClone(
          events.filter(
            ({ event }) =>
              (!filter.type || event.type.startsWith(filter.type)) &&
              (!filter.sessionID ||
                ("data" in event &&
                  (event.data as { sessionID?: string }).sessionID ===
                    filter.sessionID)),
          ),
        ),
      tools: (filter = {}) =>
        structuredClone(
          tools.filter(
            (call) =>
              (!filter.name || call.name === filter.name) &&
              (!filter.sessionID || call.sessionID === filter.sessionID),
          ),
        ),
      sessions,
      async messages(sessionID) {
        const host = await nativeSDK();
        const ids = sessionID
          ? [sessionID]
          : (await sessions()).map((session) => session.id);
        const records: RecordedMessage[] = [];
        for (const id of ids) {
          let cursor: string | undefined;
          do {
            const page = await host.message.list({
              sessionID: id,
              limit: 100,
              ...(cursor ? { cursor } : { order: "asc" }),
            });
            records.push(
              ...page.data.map((message) => ({ sessionID: id, message })),
            );
            cursor = page.cursor.next ?? undefined;
          } while (cursor);
        }
        return records;
      },
      async export(sessionID = rootID ?? undefined) {
        if (!sessionID) throw new Error("This recording has no native session");
        return (await nativeSDK()).session.export({
          sessionID,
          sanitize: false,
        });
      },
    },
    workspace: {
      files: (revision = "final") => evidence.files(revision),
      read: (path, revision = "final") => evidence.readFile(path, revision),
      text: readText,
      async diff(path) {
        const initial = evidence
          .files("initial")
          .some((file) => file.path === path);
        const final = evidence
          .files("final")
          .some((file) => file.path === path);
        return {
          initial: initial ? await readText(path, "initial") : null,
          final: final ? await readText(path, "final") : null,
        };
      },
      async materialize(revision = "final") {
        const directory = await mkdtemp(resolve(await temp(), "workspace-"));
        const files = evidence.files(revision);
        for (const file of files.filter((file) => file.symlink === undefined)) {
          const path = contained(directory, file.path);
          await mkdir(dirname(path), { recursive: true });
          await Bun.write(path, await evidence.readFile(file.path, revision));
        }
        for (const file of files.filter((file) => file.symlink !== undefined)) {
          const path = contained(directory, file.path),
            link = file.symlink!;
          const target = link.startsWith("/workspace/")
            ? contained(directory, link.slice("/workspace/".length))
            : isAbsolute(link)
              ? ""
              : resolve(dirname(path), link);
          if (
            !target ||
            (target !== directory && !target.startsWith(directory + sep))
          )
            throw new Error(
              `Recorded symlink leaves its workspace: ${file.path}`,
            );
          await mkdir(dirname(path), { recursive: true });
          const isDirectory = files.some((item) =>
            item.path.startsWith(
              relative(directory, target).replaceAll("\\", "/") + "/",
            ),
          );
          await symlink(
            process.platform === "win32" && isDirectory
              ? target
              : relative(dirname(path), target),
            path,
            process.platform === "win32" && isDirectory
              ? "junction"
              : isDirectory
                ? "dir"
                : "file",
          );
        }
        return directory;
      },
    },
    native: {
      version: archive?.opencodeVersion ?? null,
      readerVersion: OPENCODE_VERSION,
      database: () =>
        (database ??= (async () => {
          const db = new Database(await copyDatabase("readonly.db"), {
            readonly: true,
          });
          db.exec("PRAGMA query_only=ON");
          return db;
        })()),
      sdk: nativeSDK,
      schema: () => import("@opencode/schema"),
    },
    async [Symbol.asyncDispose]() {
      try {
        if (sdk) await (await sdk).close();
      } finally {
        try {
          if (database) (await database).close();
        } finally {
          if (temporary)
            await rm(await temporary, {
              recursive: true,
              force: true,
              maxRetries: 5,
              retryDelay: 100,
            });
        }
      }
    },
  };
}
