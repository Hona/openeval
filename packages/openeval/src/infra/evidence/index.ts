import { appendFileSync } from "node:fs";
import { mkdir, lstat, readdir, readlink, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  OpenCodeStreamEvent,
  ToolCall,
  EvidenceRef,
  EvidenceCheckpoint,
} from "../../types";
import type { EvidenceFeed, EvidenceView, EvidenceQuery } from "../../evidence";
export type { EvidenceQuery } from "../../evidence";
import { trackTool } from "./tool-calls";
import { hash as sha256, writeJson } from "../files";
import { measureRecording } from "../recording/metrics";
import {
  evidencePage as page,
  evidenceTextPage as textPage,
  type EvidenceDocument,
} from "../../evidence-query";
type InferenceResponse = { text: string; textBlocks?: string[] };
type ArtifactPolicy = { excludeDirectories: string[] };

export const EVIDENCE_VERSION = 1;
export type EvidenceQueryAudit = {
  sequence: number;
  startedAt: string;
  completedAt?: string;
  input: EvidenceQuery;
  result?: unknown;
  error?: string;
  checkId?: string;
  checkpoint?: EvidenceCheckpoint;
};
export type FileEntry = {
  path: string;
  bytes: number;
  sha256?: string;
  symlink?: string;
};
type Snapshot = { capturedAt: string; files: FileEntry[] };
export type EvidenceEvent = {
  sequence: number;
  time: string;
  event: OpenCodeStreamEvent;
};
export type EvidenceManifest = {
  version: 1;
  handle: "candidate";
  coverage: "recorded-session" | "recorded-prefix";
  createdAt: string;
  prompt: string;
  response: Pick<InferenceResponse, "text" | "textBlocks">;
  tools: ToolCall[];
  events: { count: number; sha256: string };
  initial?: Snapshot;
  final?: Snapshot;
  excludedDirectories: string[];
  checkpoint?: {
    revision: number;
    cutoffAt: number;
    boundaryEventId: string;
    cursors: Record<string, number>;
  };
};

const candidateEvent = (event: OpenCodeStreamEvent) =>
  /^(session\.|permission\.|form\.)/.test(event.type);
const portable = (path: string) => path.replaceAll("\\", "/");
const eventData = (event: OpenCodeStreamEvent): Record<string, unknown> =>
  "data" in event ? (event.data as Record<string, unknown>) : {};

/** Content-addressed snapshots are independent of subsequent candidate/judge work. */
async function snapshot(
  workspace: string,
  archive: string,
  excluded: string[] = [],
): Promise<Snapshot> {
  const files: FileEntry[] = [];
  const root = await realpath(workspace);
  const archiveRoot = await realpath(archive);
  if (root === archiveRoot || root.startsWith(archiveRoot + sep))
    throw new Error("Evidence archive cannot contain its source workspace");
  await mkdir(resolve(archiveRoot, "objects"), { recursive: true });
  async function visit(path: string) {
    if (path === archiveRoot || path.startsWith(archiveRoot + sep)) return;
    const name = portable(relative(root, path));
    if (name && name.split("/").some((part) => excluded.includes(part))) return;
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      files.push({ path: name, bytes: 0, symlink: await readlink(path) });
    } else if (info.isDirectory()) {
      for (const entry of (await readdir(path)).sort()) {
        await visit(resolve(path, entry));
      }
    } else if (info.isFile()) {
      const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
      const hash = await sha256(bytes);
      const object = Bun.file(resolve(archiveRoot, "objects", hash));
      if (!(await object.exists())) await Bun.write(object, bytes);
      files.push({ path: name, bytes: bytes.length, sha256: hash });
    }
  }
  await visit(root);
  return { capturedAt: new Date().toISOString(), files };
}

export class EvidenceCapture {
  private count = 0;
  private records: EvidenceEvent[] = [];
  private boundary = -1;
  private closed = false;
  private listeners = new Set<() => void>();
  private checkpoints = new Map<number, Promise<EvidenceView>>();
  private constructor(
    readonly directory: string,
    private initial?: Snapshot,
    private excludedDirectories: string[] = [],
  ) {}

  static async create(
    directory: string,
    initialWorkspace?: string,
    policy?: ArtifactPolicy,
  ) {
    if (
      policy?.excludeDirectories.some(
        (path) =>
          !path || path.includes("/") || path.includes("\\") || path === "..",
      )
    )
      throw new Error("Artifact exclusions must be directory names");
    const excluded = policy?.excludeDirectories ?? [];
    await mkdir(directory, { recursive: true });
    if (await Bun.file(resolve(directory, "manifest.json")).exists())
      throw new Error("Evidence archive already exists");
    await Bun.write(resolve(directory, "events.jsonl"), "");
    return new EvidenceCapture(
      directory,
      initialWorkspace
        ? await snapshot(initialWorkspace, directory, excluded)
        : undefined,
      excluded,
    );
  }

  event(event: OpenCodeStreamEvent, time = new Date().toISOString()) {
    if (!candidateEvent(event)) return;
    const record = {
      sequence: this.count++,
      time,
      event: structuredClone(event),
    };
    this.records.push(record);
    appendFileSync(
      resolve(this.directory, "events.jsonl"),
      JSON.stringify(record, (_key, value) =>
        typeof value === "bigint" ? String(value) : value,
      ) + "\n",
    );
    const previous =
      this.boundary >= 0 ? this.records[this.boundary].event : undefined;
    if (
      !this.closed &&
      "created" in event &&
      (!previous ||
        !("created" in previous) ||
        event.created >= previous.created) &&
      (event.type === "session.tool.success" ||
        event.type === "session.tool.failed" ||
        (event.type === "session.step.ended" &&
          event.data.finish !== "tool-calls"))
    ) {
      this.boundary = record.sequence;
      for (const wake of this.listeners) wake();
    }
  }

  close() {
    this.closed = true;
    for (const wake of this.listeners) wake();
  }

  feed(
    prompt: string,
    synchronize?: (
      cutoffAt: number,
      signal: AbortSignal,
    ) => Promise<OpenCodeStreamEvent[]>,
  ): EvidenceFeed {
    let consumed = -1,
      signature: string | undefined;
    return {
      next: async (after, signal) => {
        for (;;) {
          after = Math.max(after, consumed);
          signal.throwIfAborted();
          if (this.boundary <= after && !this.closed)
            await new Promise<void>((done, reject) => {
              const clear = () => {
                this.listeners.delete(wake);
                signal.removeEventListener("abort", abort);
              };
              const wake = () => {
                clear();
                done();
              };
              const abort = () => {
                clear();
                reject(signal.reason);
              };
              this.listeners.add(wake);
              signal.addEventListener("abort", abort, { once: true });
            });
          signal.throwIfAborted();
          if (this.closed || this.boundary <= after) return;
          const revision = this.boundary;
          try {
            const boundary = this.records[revision].event;
            const events = synchronize
              ? await synchronize(
                  "created" in boundary ? boundary.created : Date.now(),
                  signal,
                )
              : undefined;
            signal.throwIfAborted();
            consumed = revision;
            if (this.closed) return;
            if (events) {
              if (
                !events.some(
                  (event) =>
                    "id" in event &&
                    "id" in boundary &&
                    event.id === boundary.id,
                )
              )
                throw new Error(
                  "The checkpoint boundary is not in durable history",
                );
              const next = events
                .flatMap((event) => ("id" in event ? [event.id] : []))
                .sort()
                .join("\n");
              if (next === signature) continue;
              signature = next;
            }
            let view = this.checkpoints.get(revision);
            if (!view) {
              view = this.checkpoint(prompt, revision, events);
              this.checkpoints.set(revision, view);
            }
            const result = await view;
            signal.throwIfAborted();
            if (!this.closed) return result;
            return;
          } catch (error) {
            if (!this.closed) throw error;
            return;
          }
        }
      },
    };
  }

  private async checkpoint(
    prompt: string,
    through: number,
    durable?: OpenCodeStreamEvent[],
  ): Promise<EvidenceView> {
    // Copy the exact prefix before any asynchronous writes. Later events cannot enter this view.
    const records = durable
      ? durable.map((event, sequence) => ({
          sequence,
          time: new Date(
            "created" in event ? event.created : Date.now(),
          ).toISOString(),
          event,
        }))
      : this.records.slice(0, through + 1);
    const events = records
      .map(
        (record) =>
          JSON.stringify(record, (_key, value) =>
            typeof value === "bigint" ? String(value) : value,
          ) + "\n",
      )
      .join("");
    const tools = new Map<string, ToolCall>();
    let text = "";
    const root = records.find(
      ({ event }) => event.type === "session.created" && !event.data.parentID,
    );
    const rootId = root ? eventData(root.event).sessionID : undefined;
    for (const { event } of records) {
      if (event.type.startsWith("session.tool.")) trackTool(tools, event);
      if (
        event.type === "session.text.ended" &&
        (!rootId || event.data.sessionID === rootId)
      )
        text = event.data.text;
    }
    const directory = resolve(this.directory, "checkpoints", String(through));
    await mkdir(directory, { recursive: true });
    const manifest: EvidenceManifest = {
      version: EVIDENCE_VERSION,
      handle: "candidate",
      coverage: "recorded-prefix",
      createdAt: new Date().toISOString(),
      prompt,
      response: { text },
      tools: [...tools.values()],
      events: { count: records.length, sha256: sha256(events) },
      excludedDirectories: this.excludedDirectories,
      ...(durable
        ? {
            checkpoint: {
              revision: through,
              cutoffAt: (this.records[through].event as { created: number })
                .created,
              boundaryEventId: (this.records[through].event as { id: string })
                .id,
              cursors: Object.fromEntries(
                [
                  ...new Set(
                    durable.flatMap((event) =>
                      "durable" in event ? [event.durable.aggregateID] : [],
                    ),
                  ),
                ].map((id) => [
                  id,
                  Math.max(
                    ...durable.flatMap((event) =>
                      "durable" in event && event.durable.aggregateID === id
                        ? [event.durable.seq]
                        : [],
                    ),
                  ),
                ]),
              ),
            },
          }
        : {}),
    };
    await Bun.write(resolve(directory, "events.jsonl"), events);
    await writeJson(resolve(directory, "manifest.json"), manifest);
    const hash = sha256(
      await Bun.file(resolve(directory, "manifest.json")).bytes(),
    );
    return (await CandidateEvidence.open(directory, hash)).view({
      directory,
      hash,
    });
  }

  async finish(input: {
    prompt: string;
    response: InferenceResponse;
    tools: ToolCall[];
    workspace: string;
  }) {
    this.close();
    const events = await Bun.file(
      resolve(this.directory, "events.jsonl"),
    ).text();
    const manifest: EvidenceManifest = {
      version: EVIDENCE_VERSION,
      handle: "candidate",
      createdAt: new Date().toISOString(),
      coverage: "recorded-session",
      prompt: input.prompt,
      response: {
        text: input.response.text,
        textBlocks: input.response.textBlocks,
      },
      tools: input.tools,
      events: { count: this.count, sha256: await sha256(events) },
      initial: this.initial,
      final: await snapshot(
        input.workspace,
        this.directory,
        this.excludedDirectories,
      ),
      excludedDirectories: this.excludedDirectories,
    };
    await writeJson(resolve(this.directory, "manifest.json"), manifest);
    return {
      version: EVIDENCE_VERSION,
      path: "evidence",
      sha256: await sha256(
        await Bun.file(resolve(this.directory, "manifest.json")).text(),
      ),
    } as const;
  }
}

// Preserve the source archive exactly; omit explicit model/accounting metadata from judge queries.
function blindEvent(record: EvidenceEvent) {
  const value = structuredClone(record);
  const data = eventData(value.event);
  for (const key of [
    "model",
    "modelID",
    "providerID",
    "usage",
    "cost",
    "tokens",
    "state",
    "providerState",
    "resultState",
  ])
    delete data[key];
  return { ...value, event: { ...value.event, data } };
}

export class CandidateEvidence {
  private constructor(
    readonly directory: string,
    readonly manifest: EvidenceManifest,
    private records: EvidenceEvent[],
    readonly hash: string,
  ) {}

  /** Native records for trusted code judges. LLM queries use the separate blinded view. */
  rawEvents(): EvidenceEvent[] {
    return structuredClone(this.records);
  }

  toolCalls(): ToolCall[] {
    return structuredClone(this.manifest.tools);
  }

  /** Complete recording values for evidence consumers. Artifact reads stay lazy. */
  document(): Omit<EvidenceDocument, "artifacts"> {
    return {
      summary: this.summary(),
      response: this.manifest.response.text,
      messages: this.messages(),
      events: this.records.map((record) => {
        const blinded = blindEvent(record);
        return {
          sequence: record.sequence,
          time: record.time,
          event: {
            type: record.event.type,
            data: eventData(blinded.event as OpenCodeStreamEvent),
          },
        };
      }),
      tools: this.toolCalls(),
      metrics: measureRecording(this.records, this.manifest.tools, {
        directory: this.directory,
        hash: this.hash,
      }),
    };
  }

  files(revision: "initial" | "final" = "final"): FileEntry[] {
    const snapshot = this.manifest[revision];
    if (!snapshot)
      throw new Error(`${revision} workspace snapshot is unavailable`);
    return structuredClone(snapshot.files);
  }

  async readFile(path: string, revision: "initial" | "final" = "final") {
    const entry = this.entry(path, revision);
    if (!entry) throw new Error(`Artifact not found: ${path}`);
    return this.bytes(entry);
  }

  view(reference: EvidenceRef): EvidenceView {
    if (reference.hash !== this.hash)
      throw new Error("Evidence view reference does not match its archive");
    return Object.freeze({
      checkpoint: Object.freeze({
        ...reference,
        revision:
          this.manifest.checkpoint?.revision ?? this.manifest.events.count - 1,
        through: this.manifest.events.count - 1,
        createdAt: this.manifest.createdAt,
        ...(this.manifest.checkpoint
          ? {
              cutoffAt: this.manifest.checkpoint.cutoffAt,
              boundaryEventId: this.manifest.checkpoint.boundaryEventId,
              cursors: Object.freeze({ ...this.manifest.checkpoint.cursors }),
            }
          : {}),
      }),
      summary: () => this.summary(),
      query: (input: EvidenceQuery) => this.query(input),
    });
  }

  static async open(directory: string, expectedHash?: string) {
    const root = await realpath(directory);
    const manifestPath = resolve(root, "manifest.json");
    if ((await realpath(manifestPath)) !== manifestPath)
      throw new Error("Invalid evidence manifest path");
    const text = await Bun.file(manifestPath).text();
    const hash = await sha256(text);
    if (expectedHash && hash !== expectedHash)
      throw new Error("Evidence manifest hash mismatch");
    const manifest: EvidenceManifest = JSON.parse(text);
    if (
      manifest.version !== EVIDENCE_VERSION ||
      manifest.handle !== "candidate"
    )
      throw new Error("Unsupported evidence archive");
    const eventsPath = resolve(root, "events.jsonl");
    if ((await realpath(eventsPath)) !== eventsPath)
      throw new Error("Invalid evidence events path");
    const events = await Bun.file(eventsPath).text();
    if ((await sha256(events)) !== manifest.events.sha256)
      throw new Error("Evidence event hash mismatch");
    const records = events
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as EvidenceEvent);
    if (
      records.length !== manifest.events.count ||
      records.some((record, index) => record.sequence !== index)
    )
      throw new Error("Evidence event sequence mismatch");
    return new CandidateEvidence(root, manifest, records, hash);
  }

  summary() {
    const sessions = new Map<
      string,
      { id: string; parentID?: string; events: number }
    >();
    for (const { event } of this.records) {
      const data = eventData(event);
      const id = data.sessionID;
      if (typeof id !== "string") continue;
      const item = sessions.get(id) ?? {
        id,
        parentID: undefined as string | undefined,
        events: 0,
      };
      item.events++;
      if (typeof data.parentID === "string") item.parentID = data.parentID;
      sessions.set(id, item);
    }
    return {
      handle: "candidate",
      archiveSHA256: this.hash,
      coverage: this.manifest.coverage,
      checkpoint: this.manifest.checkpoint
        ? structuredClone(this.manifest.checkpoint)
        : undefined,
      sessions: [...sessions.values()],
      events: this.records.length,
      toolCalls: this.manifest.tools.length,
      toolNames: [...new Set(this.manifest.tools.map((tool) => tool.name))],
      responsePreview: this.manifest.response.text.slice(0, 1200),
      responseCharacters: this.manifest.response.text.length,
      initialSnapshot: !!this.manifest.initial,
      initialCapturedAt: this.manifest.initial?.capturedAt,
      finalCapturedAt: this.manifest.final?.capturedAt,
      files: this.manifest.final?.files.length ?? 0,
      excludedDirectories: this.manifest.excludedDirectories,
    };
  }

  private messages() {
    const messages = new Map<
      string,
      {
        id: string;
        sessionID: string;
        role: string;
        text: string;
        firstSequence: number;
        lastSequence: number;
        complete: boolean;
      }
    >();
    for (const record of this.records) {
      const { event, sequence } = record;
      const data = eventData(event);
      if (typeof data.sessionID !== "string") continue;
      if (
        event.type === "session.inbox.enqueued" &&
        event.data.item.type === "user"
      ) {
        const item = event.data.item;
        const id = `${data.sessionID}:${event.data.inboxID}`;
        messages.set(id, {
          id,
          sessionID: data.sessionID,
          role: item.type,
          text: item.payload.text,
          firstSequence: sequence,
          lastSequence: sequence,
          complete: true,
        });
      }
      const kind = /^session\.(text|reasoning)\.(started|delta|ended)$/.exec(
        event.type,
      );
      if (!kind) continue;
      const id = `${data.sessionID}:${data.assistantMessageID}:${kind[1]}:${data.ordinal}`;
      const message = messages.get(id) ?? {
        id,
        sessionID: data.sessionID,
        role: kind[1] === "text" ? "assistant" : "reasoning",
        text: "",
        firstSequence: sequence,
        lastSequence: sequence,
        complete: false,
      };
      if (kind[2] === "delta" && !message.complete)
        message.text += String(data.delta ?? "");
      if (kind[2] === "ended") {
        message.text = String(data.text ?? "");
        message.complete = true;
      }
      message.lastSequence = sequence;
      messages.set(id, message);
    }
    return [...messages.values()];
  }

  private entry(path: string | undefined, revision: "initial" | "final") {
    if (!path || isAbsolute(path) || path.split(/[\\/]/).includes(".."))
      throw new Error("Use a relative path from the artifact listing");
    const snapshot = this.manifest[revision];
    if (!snapshot)
      throw new Error(
        `${revision} workspace snapshot is unavailable in this evidence view`,
      );
    return snapshot.files.find((entry) => entry.path === portable(path));
  }

  private async bytes(entry: FileEntry) {
    if (entry.symlink !== undefined)
      throw new Error(
        `Artifact is a symlink to ${entry.symlink}; links are not followed`,
      );
    if (!entry.sha256 || !/^[a-f0-9]{64}$/.test(entry.sha256))
      throw new Error("Invalid artifact hash");
    const path = resolve(this.directory, "objects", entry.sha256);
    if ((await realpath(path)) !== path)
      throw new Error("Invalid artifact object path");
    const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
    if ((await sha256(bytes)) !== entry.sha256)
      throw new Error("Artifact hash mismatch");
    return bytes;
  }

  async query(input: EvidenceQuery): Promise<Record<string, unknown>> {
    if (input.action === "summary") return this.summary();
    if (input.action === "metrics") {
      const metrics = measureRecording(this.records, this.manifest.tools, {
        directory: this.directory,
        hash: this.hash,
      });
      if (!input.metric) return { ...metrics };
      let value: unknown = metrics;
      for (const key of input.metric.split(".")) {
        if (!value || typeof value !== "object" || !Object.hasOwn(value, key))
          throw new Error(`Unknown recorded metric: ${input.metric}`);
        value = (value as Record<string, unknown>)[key];
      }
      return { metric: input.metric, value, evidence: metrics.evidence };
    }
    if (input.action === "response")
      return textPage(this.manifest.response.text, input);
    if (input.action === "events")
      return page(
        this.records
          .filter(({ event }) => {
            const data = eventData(event);
            return (
              (!input.sessionID || data?.sessionID === input.sessionID) &&
              (!input.type || event.type.startsWith(input.type))
            );
          })
          .map((record) => ({
            sequence: record.sequence,
            time: record.time,
            type: record.event.type,
            sessionID: eventData(record.event).sessionID,
            preview: JSON.stringify(blindEvent(record).event.data).slice(
              0,
              500,
            ),
          })),
        input,
      );
    if (input.action === "event") {
      const record = this.records.find(
        (record) => String(record.sequence) === input.id,
      );
      if (!record) throw new Error("Unknown event sequence; supply it as id");
      return textPage(JSON.stringify(blindEvent(record), null, 2), input);
    }
    if (input.action === "messages")
      return page(
        this.messages()
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
      const message = this.messages().find(
        (message) => message.id === input.id,
      );
      if (!message) throw new Error("Unknown message ID");
      return { ...message, ...textPage(message.text, input) };
    }
    if (input.action === "tools")
      return page(
        this.manifest.tools.map(
          ({ id, name, status, startedAt, completedAt }) => ({
            id,
            name,
            status,
            startedAt,
            completedAt,
          }),
        ),
        input,
      );
    if (input.action === "tool") {
      const tool = this.manifest.tools.find((tool) => tool.id === input.id);
      if (!tool) throw new Error("Unknown tool call ID");
      return textPage(JSON.stringify(tool, null, 2), input);
    }
    if (input.action === "artifacts") {
      const files = this.manifest[input.revision ?? "final"]?.files;
      if (!files)
        throw new Error(
          "Workspace snapshots are unavailable in a live prefix; inspect recorded tools or continue",
        );
      const entries =
        input.revision === "initial"
          ? files
          : [
              ...files,
              ...(this.manifest.initial?.files.filter(
                (entry) => !files.some((file) => file.path === entry.path),
              ) ?? []),
            ];
      return page(
        entries
          .filter((entry) => !input.path || entry.path.startsWith(input.path))
          .map((entry) => {
            const before = this.manifest.initial?.files.find(
              (item) => item.path === entry.path,
            );
            const after = this.manifest.final?.files.find(
              (item) => item.path === entry.path,
            );
            return {
              ...entry,
              change: !this.manifest.initial
                ? "unknown"
                : !before
                  ? "added"
                  : !after
                    ? "deleted"
                    : before.sha256 === after.sha256 &&
                        before.symlink === after.symlink
                      ? "unchanged"
                      : "changed",
            };
          }),
        input,
      );
    }
    if (input.action === "artifact") {
      const entry = this.entry(input.path, input.revision ?? "final");
      if (!entry) throw new Error("Artifact not found in this snapshot");
      if (entry.symlink !== undefined) return entry;
      const bytes = await this.bytes(entry);
      return {
        ...entry,
        encoding: input.encoding ?? "utf8",
        ...textPage(
          input.encoding === "base64"
            ? Buffer.from(bytes).toString("base64")
            : new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          input,
        ),
      };
    }
    if (input.action === "diff") {
      const before = this.entry(input.path, "initial"),
        after = this.entry(input.path, "final");
      if (!before && !after)
        throw new Error("Artifact not found in either snapshot");
      const render = async (entry?: FileEntry) =>
        !entry
          ? null
          : entry.symlink !== undefined
            ? entry
            : {
                ...entry,
                ...textPage(
                  new TextDecoder("utf-8", { fatal: true }).decode(
                    await this.bytes(entry),
                  ),
                  input,
                ),
              };
      return { initial: await render(before), final: await render(after) };
    }
    throw new Error("Unknown evidence action");
  }
}
