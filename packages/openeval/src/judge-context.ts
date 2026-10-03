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
  Engine,
  EvidenceCitation,
} from "./types";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export type ScoreValue = boolean | number | null;

/** Scalars remain sufficient. Add explanations only when they help a reader. */
export type CodeScore = ScoreValue | {
  value: ScoreValue;
  reason: string;
  evidence?: EvidenceCitation[];
  measurements?: Record<string, JsonValue>;
};

export type VerificationEnvironment = {
  engine?: Engine;
  /** A locally available OCI image; resolved to an immutable ID before collection. */
  image: string;
  cpus?: number;
  memoryMiB?: number;
  /** Workspace tmpfs capacity in MiB; default 512. A custom value must fit within memoryMiB. */
  workspaceMiB?: number;
  /** Maximum restored workspace archive size in MiB; default 128. */
  inputMiB?: number;
};
export type VerificationRuntime = {
  engine: Engine;
  image: string;
  imageId: string;
  cpus: number;
  memoryMiB: number;
  workspaceMiB?: number;
  inputMiB?: number;
};
export type VerificationRequest = {
  revision?: Revision;
  cwd?: string;
  /** Commands run in order; a nonzero exit stops this verification. No implicit shell. */
  commands: readonly (readonly string[])[];
  /** Trusted, frozen judge inputs, copied to /verification; never to the candidate. */
  files?: Record<string, string>;
  /** Relative paths under the restored workspace; missing outputs are reported. */
  artifacts?: readonly string[];
  timeoutMs?: number;
};
export type VerificationArtifact = {
  path: string;
  bytes: number;
  sha256: string;
  /** Relative to the code-judge execution directory, not the candidate workspace. */
  file: string;
};
export type VerificationResult = {
  id: string;
  state: "completed" | "timed_out";
  revision: Revision;
  environment: VerificationRuntime;
  startedAt: string;
  elapsedMs: number;
  commands: Array<{ argv: string[]; exitCode: number | null; elapsedMs: number }>;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  logsTruncated: boolean;
  artifacts: VerificationArtifact[];
  missingArtifacts: string[];
};

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
  readonly verification: {
    /** Execute an artifact in a credential-free, network-isolated OCI container. */
    run(request: VerificationRequest): Promise<VerificationResult>;
    /** Read one retained output, checking its hash. No original runtime-state claim. */
    read(result: VerificationResult, path: string): Promise<Uint8Array>;
    text(result: VerificationResult, path: string): Promise<string>;
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
  /** Executable identity: bundled code and imported package versions, without host paths or comments. */
  hash: string;
  source: string;
  sourceMap: string;
  /** Packages imported at run time, as `name@version/path`, with the file each resolved to. */
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
  verifications?: VerificationResult[];
};
