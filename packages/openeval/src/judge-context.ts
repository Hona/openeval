import type { Database } from "bun:sqlite";
import type { OpenCode } from "@opencode/sdk";
import type {
  SessionInfo,
  SessionMessageInfo,
  SessionTransferData,
} from "@opencode/client";
import type {
  EvalRun,
  EvidenceRef,
  OpenCodeStreamEvent,
  ToolCall,
  Cost,
  Accounting,
} from "./types";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export type ScoreValue = boolean | number | null;

/** Code judges are ordinary functions. Only an optional scores map has grading semantics. */
export type JudgeFunction = (
  context: JudgeContext,
) => JsonValue | Promise<JsonValue>;

export type ToolMetrics = {
  calls: number;
  succeeded: number;
  failed: number;
  unfinished: number;
  /** Failed / (succeeded + failed); null when there are no terminal calls. */
  errorRate: number | null;
};
export type RunMetrics = {
  version: 1;
  scope: "candidate";
  /** False for constructed controls or incomplete durable execution history. */
  complete: boolean;
  sessions: number;
  requests: {
    started: number;
    succeeded: number;
    failed: number;
    retries: number;
  };
  tokens: Accounting["tokens"] | null;
  cost: Cost;
  tools: ToolMetrics & { byName: Record<string, ToolMetrics> };
  compactions: { started: number; completed: number; failed: number };
  timing: {
    elapsedMs: number | null;
    modelActiveMs: number;
    /** Output tokens / model-active seconds; overlapping requests count once. */
    outputTokensPerSecond: number | null;
  };
  evidence: EvidenceRef;
};

export type RecordedEvent = {
  sequence: number;
  time: string;
  event: OpenCodeStreamEvent;
};
export type RecordedMessage = {
  sessionID: string;
  message: SessionMessageInfo;
};
export type RecordedFile = {
  path: string;
  bytes: number;
  sha256?: string;
  symlink?: string;
};
export type Revision = "initial" | "final";

export interface JudgeContext {
  /** Missing response text is normalized to an empty string. */
  readonly response: { readonly text: string };
  readonly prompt: string;
  /** Null for constructed evidence that did not execute a candidate. */
  readonly run: Readonly<EvalRun> | null;
  readonly metrics: Readonly<RunMetrics>;
  readonly recording: {
    readonly evidence: EvidenceRef;
    readonly sessionID: string | null;
    readonly coverage: "recorded-session" | "recorded-prefix";
    events(filter?: { sessionID?: string; type?: string }): RecordedEvent[];
    tools(filter?: { sessionID?: string; name?: string }): ToolCall[];
    sessions(): Promise<SessionInfo[]>;
    /** Full projected history, including messages before compaction. */
    messages(sessionID?: string): Promise<RecordedMessage[]>;
    export(sessionID?: string): Promise<SessionTransferData>;
  };
  readonly workspace: {
    files(revision?: Revision): RecordedFile[];
    read(path: string, revision?: Revision): Promise<Uint8Array>;
    text(path: string, revision?: Revision): Promise<string>;
    diff(
      path: string,
    ): Promise<{ initial: string | null; final: string | null }>;
    /** Restore a disposable snapshot for author-owned verification commands. */
    materialize(revision?: Revision): Promise<string>;
  };
  readonly native: {
    readonly version: string | null;
    readonly readerVersion: string;
    /** Read-only SQL access to a verified, disposable native database copy. */
    database(): Promise<Database>;
    /** The pinned OpenCode API/SDK over a separate disposable database copy. */
    sdk(): Promise<OpenCode.Interface>;
    schema(): Promise<typeof import("@opencode/schema")>;
  };
}

/** Frozen judging source and dependency identity, kept in host-side run records. */
export type CodeJudgeDefinition = {
  file: string;
  hash: string;
  source: string;
  sourceMap: string;
  dependencies: Record<string, string>;
};
export type CodeJudgeExecution = {
  state: "completed" | "failed" | "timed_out";
  startedAt: string;
  completedAt: string;
  elapsedMs: number;
  /** Original JSON, before boolean score normalization. */
  output?: JsonValue;
  scores?: Record<string, number | null>;
  metrics?: RunMetrics;
  error?: string;
  sourceHash: string;
  stdout: string;
  stderr: string;
};
