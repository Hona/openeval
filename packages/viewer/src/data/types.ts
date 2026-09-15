import type { EvidenceQuery } from "@hona/openeval";
import type { RunEvent } from "@hona/openeval/types";
import type {
  ActivityRun,
  EvalRunIndex,
  JudgeAudit,
  LiveEvalRun,
  ResultIndex,
  ResultSummary,
  SessionStage,
} from "@hona/openeval/view";

export type ViewerCapabilities = {
  details: boolean;
  activity: boolean;
  live: boolean;
};
export type ViewerIndex = Omit<ResultIndex, "public"> & {
  capabilities: ViewerCapabilities;
};
export type SessionProgress = Pick<LiveEvalRun, "status" | "stage">;
export type SessionUpdate =
  | { type: "snapshot"; document: SessionStage }
  | { type: "records"; records: RunEvent[] }
  | { type: "state"; state: SessionProgress }
  | { type: "connection"; state: "streaming" | "reconnecting" | "unavailable" }
  | { type: "complete" };

/** UI contract: no HTTP paths, storage filenames, or transport-mode switches. */
export interface ViewerDataSource {
  index(): Promise<ViewerIndex>;
  summary(id: string): Promise<ResultSummary>;
  runs(id: string): Promise<EvalRunIndex>;
  activity(): Promise<ActivityRun[]>;
  judge(benchmark: string, judge: string): Promise<JudgeAudit>;
  evidence(
    benchmark: string,
    judge: string,
    check: string,
    query: EvidenceQuery,
  ): Promise<Record<string, unknown>>;
  watchSession(
    benchmark: string,
    execution: string,
    update: (event: SessionUpdate) => void,
  ): () => void;
  watchChanges(changed: () => void): () => void;
}

export type ViewerConfig = { manifest?: string; title?: string; home?: string };
export type ViewerIO = {
  base?: string;
  fetch?: typeof fetch;
  events?: (url: string) => EventSource;
};
