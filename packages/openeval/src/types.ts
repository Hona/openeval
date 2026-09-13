import type {
  OpenCodeEvent,
  SessionLogItem,
  ConfigEntry,
  AgentInfo,
} from "@opencode/client";
export type OpenCodeStreamEvent = OpenCodeEvent | SessionLogItem;

export const CANDIDATE_TIMEOUT_MS = 45 * 60 * 1000;
export type ModelRef = `${string}/${string}`;
export type Engine = "docker" | "podman";
export type ProviderDefinitions = NonNullable<
  Extract<ConfigEntry, { type: "document" }>["info"]["providers"]
>;
export type AgentDefinitions = NonNullable<
  Extract<ConfigEntry, { type: "document" }>["info"]["agents"]
>;
export type SessionState =
  "running" | "completed" | "stopped" | "failed" | "timed_out";
export type Stage = "candidate" | "judge";

export type Judge = {
  model: ModelRef;
  timeoutMs?: number;
  websearch?: "exa" | false;
};
export type Benchmark = {
  name?: string;
  models: readonly ModelRef[];
  judge: Judge;
  repetitions?: number;
  concurrency?: number;
  candidate?: {
    /** Starting OpenCode agent. Defaults to build; models selects its model. */
    agent?: string;
    /** Native OpenCode definitions, including subagents and their models. */
    agents?: AgentDefinitions;
    timeoutMs?: number;
    websearch?: "exa" | false;
    providers?: ProviderDefinitions;
  };
  container?: {
    engine?: Engine;
    image?: string;
    cpus?: number;
    memoryMiB?: number;
  };
};
export type PreparationStep = { cwd: string; argv: readonly string[] };
export type MonitorPolicy = {
  minIntervalMs: number;
  maxChecks: number;
  maxCostUSD: number;
};
export type Eval = {
  /** Let the host judge stop execution once the criterion is conclusively decided. */
  earlyStop?:
    boolean | (Partial<MonitorPolicy> & { onlyModels?: readonly ModelRef[] });
  workspace?: {
    repository?: string;
    /** Readable file overlays committed in order to the named refs, on the host. */
    revisions?: readonly { ref: string; directory: string; message: string }[];
    ref: string;
    commit?: string;
    checkout?: string;
    remote?: string;
    overlay?: string;
  };
  prepare?: readonly PreparationStep[];
};
export type EvalDefinition = {
  id: string;
  directory: string;
  prompt: string;
  judge: string;
  settings: Eval;
  sourceHash: string;
  judgeHash: string;
  /** Declared by `## Metric: id — Label` headings in judge.md. */
  metrics: MetricDefinition[];
  name: string;
};
export type BenchmarkDefinition = {
  name: string;
  directory: string;
  models: ModelRef[];
  judge: Required<Judge>;
  repetitions: number;
  concurrency: number;
  candidate: {
    agent: string;
    agents?: AgentDefinitions;
    timeoutMs: number;
    websearch: "exa" | false;
    providers?: ProviderDefinitions;
  };
  container: { engine: Engine; image: string; cpus: number; memoryMiB: number };
  evals: EvalDefinition[];
};
export type Cost = {
  usd: number | null;
  reportedUSD: number;
  complete: boolean;
};
export type Accounting = {
  costUSD: number;
  sessions: number;
  steps: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: { read: number; write: number };
  };
};
export type SessionArchive = {
  sessionId: string;
  database: string;
  databaseHash: string;
  opencodeVersion: string;
  accounting?: Accounting;
};
export type ToolCall = {
  id: string;
  name: string;
  assistantMessageId: string;
  status: "preparing" | "called" | "succeeded" | "failed";
  input?: Record<string, unknown>;
  rawInput?: string;
  content?: unknown;
  error?: unknown;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  executed?: boolean;
};
export type EvidenceRef = { directory: string; hash: string };
export type EvidenceCheckpoint = EvidenceRef & {
  /** Monotonic feed revision used to coalesce updates. */
  revision: number;
  /** Inclusive, zero-based sequence within this fixed evidence view. */
  through: number;
  createdAt: string;
  cutoffAt?: number;
  boundaryEventId?: string;
  cursors?: Record<string, number>;
};
export type EarlyDecision =
  | { kind: "continue"; reason: string }
  | { kind: "decided"; judgment: Judgment & { value: number } };
export type JudgeCheck = {
  id: string;
  judgeRunId: string;
  purpose: "early" | "final";
  checkpoint: EvidenceCheckpoint;
  state: "running" | "completed" | "failed" | "cancelled";
  startedAt: string;
  /** Worker admission time, excluding time queued for judge capacity. */
  executionStartedAt?: string;
  completedAt?: string;
  decision?:
    | { kind: "continue"; reason: string }
    | { kind: "decided"; judgment: Judgment };
  error?: string;
  /** Range in the runner log containing this judge turn. */
  events: { after: number; through?: number };
};
export type EvalStop = {
  reason: "judge_decided";
  requestedAt: string;
  judgeRunId: string;
  checkId: string;
  checkpoint: EvidenceCheckpoint;
  applied?: boolean;
};
export type EvalRunInput = {
  evalId: string;
  model: ModelRef;
  repetition: number;
  prompt: string;
  candidateHash: string;
  sourceHash: string;
  imageId: string;
  timeoutMs: number;
  earlyStop: boolean;
  runtime: BenchmarkRun["runtime"];
};
export type EvalRun = {
  id: string;
  slotId: string;
  input: EvalRunInput;
  state: SessionState;
  startedAt: string;
  completedAt?: string;
  elapsedMs?: number;
  evidence?: EvidenceRef;
  session?: SessionArchive;
  error?: string;
  replaces?: string;
  stop?: EvalStop;
};
export type MetricDefinition = { id: string; name: string };
export type EvidenceCitation = (
  | { kind: "response" }
  | { kind: "tool" | "message" | "event"; id: string }
  | { kind: "artifact"; path: string; revision: "initial" | "final" }
) & { quote?: string; offset?: number };
export type MetricJudgment = {
  id: string;
  value: 0 | 1 | null;
  reason: string;
  evidence: EvidenceCitation[];
  sources?: string[];
};
/** value is the equal-weight metric mean, or null if any metric is unknown. */
export type Judgment = {
  value: number | null;
  reason: string;
  metrics: MetricJudgment[];
};
export type JudgeRunInput = {
  evalRunId: string;
  evidence: EvidenceRef;
  rubric: string;
  /** Shared native agent profile used for this judgment. */
  agent: Pick<AgentInfo, "id" | "mode" | "description" | "permissions"> & {
    system: string;
  };
  model: ModelRef;
  judgeHash: string;
  timeoutMs: number;
  websearch: "exa" | false;
  mode: "monitor" | "final";
  runtimeHash: string;
  metrics: MetricDefinition[];
  protocol: number;
  monitor?: MonitorPolicy;
};
export type JudgeRun = {
  id: string;
  input: JudgeRunInput;
  state: SessionState;
  startedAt: string;
  completedAt?: string;
  elapsedMs?: number;
  archiveStartedAt?: string;
  judgment?: Judgment;
  session?: SessionArchive;
  error?: string;
  activity?: "watching" | "queued" | "checking" | "finalizing";
  decisionCheckId?: string;
  monitorError?: string;
  monitorErrorAt?: string;
  monitorLimit?: string;
};
export type Slot = {
  id: string;
  evalId: string;
  model: ModelRef;
  repetition: number;
  candidateHash: string;
  judgeHash: string;
  /** Predecessor while this slot awaits an execution with changed inputs. */
  previousEvalRunId?: string;
  evalRunId: string | null;
  judgeRunId: string | null;
  active: boolean;
};
export type BenchmarkRun = {
  id: string;
  name: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  state: "running" | "completed" | "incomplete" | "failed";
  /** Work selected by the current run/retry/rejudge operation. */
  scheduledSlotIds: readonly string[];
  definition: BenchmarkDefinition;
  runtime: { imageId: string; candidateHash: string; judgeHash: string };
  error?: string;
  mergedInto?: string;
  sources?: Array<{
    id: string;
    directory: string;
    mergedAt: string;
    databaseHash: string;
  }>;
  execution: {
    startedAt: string;
    onlyModels?: readonly ModelRef[];
    onlyEvals?: readonly string[];
    onlyRepetitions?: readonly number[];
    budgetUSD?: number;
    estimatedUSD: number | null;
    spentUSD: number;
    deferred: number;
  };
};
export type PlanItem = {
  slot: Slot;
  action: "candidate" | "judge" | "reuse" | "failed" | "deferred";
  reason: string;
};
export type RunEvent = {
  stage: Stage;
  executionId: string;
  time: string;
  event: OpenCodeStreamEvent;
};
export type ExecutionObserver = (event: RunEvent) => void;
