import type { Cost } from "./types";
import type { ResultSummary } from "./view";

/** Publication format only. Evidence querying belongs to the evidence layer. */
export type ViewerAsset = { path: string; sha256: string; bytes: number };
export type ViewerExport = {
  version: 1;
  createdAt: string;
  source: {
    benchmarkId: string;
    resultsSchema: 5;
    exporterVersion: string;
    opencodeVersions: string[];
  };
  index: ViewerAsset;
  results: Record<string, { summary: ViewerAsset; runs?: ViewerAsset }>;
  sessions: Record<string, ViewerAsset>;
  judges: Record<string, ViewerAsset>;
  evidence: Record<string, Record<string, ViewerAsset>>;
  modelMetrics: ViewerAsset;
  overview: ViewerAsset;
  redactions: Record<string, number>;
};

export type ViewerOverview = {
  repetitions: number;
  summary: ResultSummary;
  evals: Record<string, ResultSummary>;
  metrics: ViewerModelMetrics[];
};

export type ViewerModelMetrics = {
  model: string;
  cost: Cost;
  toolCalls: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
};
