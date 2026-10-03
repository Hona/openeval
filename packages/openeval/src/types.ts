import type {
  OpenCodeEvent,
  SessionLogItem,
  ConfigEntry,
  AgentInfo,
} from "@opencode/client";
import type {
  CodeJudgeDefinition,
  CodeJudgeExecution,
  RunMetrics,
  VerificationEnvironment,
  VerificationRuntime,
  JsonValue,
} from "./judge-context";
export type OpenCodeStreamEvent = OpenCodeEvent | SessionLogItem;

export const CANDIDATE_TIMEOUT_MS = 45 * 60 * 1000;
export const MAX_CANDIDATE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
export type ModelRef = `${string}/${string}`;
export type Engine = "docker" | "podman";
export type ProviderDefinitions = NonNullable<
  Extract<ConfigEntry, { type: "document" }>["info"]["providers"]
>;
export type SessionState =
  | "running"
  | "completed"
  | "stopped"
  | "failed"
  | "timed_out";
export type Stage = "candidate" | "judge";

export type Judge = {
  model?: ModelRef;
  timeoutMs?: number;
  websearch?: "exa" | false;
  verification?: VerificationEnvironment;
};
/** Execution controls for one candidate attempt. Eval values override benchmark values. */
export type CandidateLimits = {
  /** Agent session limit, after preparation; default 45 minutes, at most 12 hours. */
  timeoutMs?: number;
};
export type Benchmark = {
  name?: string;
  /** Display label for one benchmark.ts among several that share `name`, such as "Frontier". */
  suite?: string;
  models: readonly ModelRef[];
  judge?: Judge;
  repetitions?: number;
  concurrency?: number;
  candidate?: CandidateLimits & {
    websearch?: "exa" | false;
    providers?: ProviderDefinitions;
  };
  container?: {
    engine?: Engine;
    image?: string;
    cpus?: number;
    memoryMiB?: number;
  };
  /** Compose the benchmark from criteria in any of these categories. Omit for every criterion. */
  categories?: readonly string[];
};
/** Optional `criteria` export from judge.ts: labels and categories for the scores it returns. */
export type CodeCriteria = Readonly<
  Record<string, { name?: string; categories?: readonly string[] }>
>;
export type PreparationStep = { cwd: string; argv: readonly string[] };
export type MonitorPolicy = {
  minIntervalMs: number;
  maxChecks: number;
  maxCostUSD: number;
};
export type Eval = {
  /** Let the host judge stop execution once the criterion is conclusively decided. */
  earlyStop?:
    | boolean
    | (Partial<MonitorPolicy> & { onlyModels?: readonly ModelRef[] });
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
  /** Overrides benchmark.candidate for this eval. */
  candidate?: CandidateLimits;
};
export type EvalDefinition = {
  id: string;
  directory: string;
  prompt: string;
  judge: string;
  settings: Eval;
  sourceHash: string;
  judgeHash: string;
  /** Criteria declared in judge.md; code-defined IDs are discovered from results. */
  criteria: CriterionDefinition[];
  /** Criteria labelled by judge.ts's `criteria` export. */
  codeCriteria?: CriterionDefinition[];
  /** Reporting categories by criterion ID; never part of judge input or fingerprints. */
  categories?: Record<string, string[]>;
  /** A frozen, bundled code judge; never sent to the candidate. */
  code?: CodeJudgeDefinition;
  name: string;
};
export type BenchmarkDefinition = {
  name: string;
  suite?: string;
  directory: string;
  models: ModelRef[];
  judge: { model?: ModelRef; timeoutMs: number; websearch: "exa" | false; verification?: VerificationRuntime | Omit<VerificationRuntime, "imageId"> };
  repetitions: number;
  concurrency: number;
  candidate: {
    timeoutMs: number;
    websearch: "exa" | false;
    providers?: ProviderDefinitions;
  };
  container: { engine: Engine; image: string; cpus: number; memoryMiB: number };
  /** Selected categories; evals without a matching criterion are excluded. */
  categories?: string[];
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
  sessionID?: string;
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
  /** Candidate-only observations, independent of rubric scores. */
  metrics?: RunMetrics;
  error?: string;
  replaces?: string;
  stop?: EvalStop;
  /** The runner stopped before this session finished; the planner collects it again. */
  interrupted?: boolean;
};
export type CriterionDefinition = { id: string; name: string };
export type EvidenceCitation = (
  | { kind: "response" }
  | { kind: "recording" }
  | { kind: "tool" | "message" | "event" | "metric"; id: string }
  | { kind: "artifact"; path: string; revision: "initial" | "final" }
  | { kind: "verification"; id: string; path?: string }
) & { quote?: string; offset?: number };
export type CriterionScore = {
  value: number | null;
  reason: string;
  evidence: EvidenceCitation[];
  sources?: string[];
  source: "judge.md" | "judge.ts";
  measurements?: Record<string, JsonValue>;
};
/** value is the equal-weight criterion mean, or null if any score is unknown. */
export type Judgment = {
  value: number | null;
  reason: string;
  scores: Record<string, CriterionScore>;
};
export type JudgeRunInput = {
  evalRunId: string;
  evidence: EvidenceRef;
  rubric: string;
  /** Shared native agent profile used for this judgment. */
  agent?: Pick<AgentInfo, "id" | "mode" | "description" | "permissions"> & {
    system: string;
  };
  model?: ModelRef;
  kind: "llm" | "code" | "hybrid";
  code?: CodeJudgeDefinition;
  codeCriteria?: CriterionDefinition[];
  verification?: VerificationRuntime;
  judgeHash: string;
  timeoutMs: number;
  websearch: "exa" | false;
  mode: "monitor" | "final";
  runtimeHash: string;
  criteria: CriterionDefinition[];
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
  code?: CodeJudgeExecution;
  error?: string;
  activity?: "watching" | "queued" | "checking" | "finalizing";
  decisionCheckId?: string;
  monitorError?: string;
  monitorErrorAt?: string;
  monitorLimit?: string;
  /** The runner stopped before judging finished; the planner judges the evidence again. */
  interrupted?: boolean;
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
/** OpenCode catalog display names keyed by `provider/model`, without the variant. */
export type ModelNames = Record<string, string>;
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
  runtime: { imageId: string; candidateHash: string; judgeHash: string; verification?: VerificationRuntime };
  /** Display metadata read from the candidate image's catalog; never part of input fingerprints. */
  modelNames?: ModelNames;
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
