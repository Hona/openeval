import type {
  FileDiffInfo,
  ModelRef as NativeModelRef,
  SessionMessageInfo,
  SessionStatus,
} from "@opencode/client";
import type {
  Cost,
  Stage,
  EvalStop,
  JudgeCheck,
  JudgeRun,
  MetricDefinition,
  MetricJudgment,
} from "./types";
import { runtimeMs, type RuntimeInterval } from "./runtime";
export { mergeRuntime, runtimeMs, runtimeClock } from "./runtime";
export type { RuntimeInterval } from "./runtime";

export type ScoreBounds = { lower: number; upper: number; coverage: number };
export type ModelScore = {
  model: string;
  earned: number | null;
  maximum: number;
  percentage: number | null;
  bounds: ScoreBounds;
  components: Array<{
    eval: string;
    metric: string;
    name: string;
    value: number | null;
    scored: number;
    expected: number;
    passed: number;
    scoredSum: number;
  }>;
};
/** Equal metric weights inside each eval, then equal eval weights.
 * https://arxiv.org/html/2607.07946#S5.SS3
 */
export function modelScore(
  model: string,
  components: ModelScore["components"],
): ModelScore {
  const evals = [...new Set(components.map((part) => part.eval))];
  const earned =
    components.length && components.every((part) => part.value !== null)
      ? evals.reduce((sum, id) => {
          const parts = components.filter((part) => part.eval === id);
          return (
            sum +
            parts.reduce((total, part) => total + part.value!, 0) / parts.length
          );
        }, 0)
      : null;
  const percentage = earned === null ? null : (100 * earned) / evals.length;
  return {
    model,
    components,
    earned,
    maximum: evals.length,
    percentage,
    bounds:
      percentage === null
        ? componentBounds(components)
        : { lower: percentage, upper: percentage, coverage: 100 },
  };
}
export const scoreBounds = (score: Pick<ModelScore, "bounds">): ScoreBounds =>
  score.bounds;

function componentBounds(components: ModelScore["components"]): ScoreBounds {
  if (!components.length) return { lower: 0, upper: 100, coverage: 0 };
  let lower = 0,
    upper = 0,
    coverage = 0;
  for (const part of components) {
    const weight =
      1 / components.filter((item) => item.eval === part.eval).length;
    if (!part.expected) {
      upper += weight;
      continue;
    }
    lower += (weight * part.scoredSum) / part.expected;
    upper +=
      (weight * (part.scoredSum + part.expected - part.scored)) / part.expected;
    coverage += (weight * part.scored) / part.expected;
  }
  const scale = 100 / new Set(components.map((part) => part.eval)).size;
  return {
    lower: lower * scale,
    upper: upper * scale,
    coverage: coverage * scale,
  };
}
export const sumCosts = (costs: readonly (Cost | undefined)[]): Cost => {
  const reportedUSD = costs.reduce(
    (sum, cost) => sum + (cost?.reportedUSD ?? 0),
    0,
  );
  const complete = costs.every((cost) => cost?.complete === true);
  return { reportedUSD, complete, usd: complete ? reportedUSD : null };
};
export type ResultEntry = {
  id: string;
  kind: "benchmark" | "eval";
  name: string;
  status: string;
  startedAt: string;
  updatedAt: number;
  models: number;
  evals: number;
};
export type ResultIndex = {
  public: boolean;
  root: string;
  entries: ResultEntry[];
  warnings: string[];
};
export type Overview = {
  name: string;
  kind: "benchmark" | "eval";
  status: string;
  startedAt: string;
  completedAt?: string;
  scores: ModelScore[];
  evals: string[];
  evalNames: Record<string, string>;
  cost: Cost;
  evalCosts: Record<string, Cost>;
  runtime: RuntimeInterval[];
};
export type ResultSummary = {
  entry: ResultEntry;
  overview: Overview;
  durationMs: number;
  related: Array<{
    id: string;
    eval: string;
    status: string;
    durationMs: number;
    runtime: RuntimeInterval[];
  }>;
};
export type StageStatus =
  | "waiting"
  | "watching"
  | "blocked"
  | "queued"
  | "in_progress"
  | "completed"
  | "stopped"
  | "timed_out"
  | "failed"
  | "interrupted";
/** One execution stage of a slot: the eval run or its judge run. */
export type StageState = {
  executionId?: string;
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  elapsedMs?: number;
  runtime: RuntimeInterval[];
  cost?: Cost;
  message?: string;
  /** Judge only: 1 pass, 0 fail, null unknown. */
  score?: number | null;
  metrics?: MetricJudgment[];
};
export type LiveEvalRun = {
  id: string;
  evalRunId?: string;
  judgeRunId?: string;
  model: string;
  reasoning: string;
  repetition: number;
  status:
    | "queued"
    | "in_progress"
    | "completed"
    | "failed"
    | "cancelled"
    | "interrupted";
  stage: Stage;
  startedAt?: string;
  completedAt?: string;
  message?: string;
  elapsedMs?: number;
  eval: StageState;
  judge: StageState;
  /** Why this slot needs a person: a failed execution or an unscored judgment. */
  attention?: string;
  earlyStop?: boolean;
  /** Whether this slot belongs to the current execution scope. */
  scheduled: boolean;
  stop?: EvalStop;
};
export type JudgeAudit = {
  judge: Pick<
    JudgeRun,
    | "id"
    | "state"
    | "activity"
    | "decisionCheckId"
    | "monitorError"
    | "monitorErrorAt"
    | "judgment"
    | "monitorLimit"
  >;
  metrics: MetricDefinition[];
  stop?: EvalStop;
  checks: Array<JudgeCheck & { runtimeMs: number }>;
  history: Array<
    Pick<JudgeRun, "id" | "state" | "startedAt"> & { mode: "monitor" | "final" }
  >;
};
export type EvalRunSummary = LiveEvalRun & { cost: Cost; elapsedMs: number };
export type EvalRunIndex = {
  entry: ResultEntry;
  eval: string;
  benchmarkId: string;
  runs: EvalRunSummary[];
};
export type ActivityRun = {
  id: string;
  benchmarkId: string;
  resultId: string;
  cost: Cost;
  state: {
    id: string;
    eval: string;
    benchmark: string;
    startedAt: string;
    heartbeatAt: string;
    status: string;
    concurrency: number;
    evalOrder: number;
    runs: LiveEvalRun[];
    runtime: RuntimeInterval[];
  };
};

export const stageRuntime = (stage: StageState, now: number) =>
  runtimeMs(stage.runtime, now);
export type RecordedSession = {
  sessionID: string;
  title: string;
  parentID?: string;
  created: number;
  model: NativeModelRef;
  agent: string;
  messages: SessionMessageInfo[];
  status: SessionStatus;
  diffs: FileDiffInfo[];
  parts: Record<
    string,
    { messageID: string; index: number; complete: boolean }
  >;
};
export type SessionStage = {
  prompt: string;
  model: string;
  sessions: RecordedSession[];
};
export type SessionSnapshot = {
  name: Stage;
  document: SessionStage;
  executionId: string;
};
