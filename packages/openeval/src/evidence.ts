import type { EvidenceCheckpoint, Judgment, EarlyDecision } from "./types";
export type EvidenceQuery = {
  action:
    | "summary"
    | "response"
    | "events"
    | "event"
    | "messages"
    | "message"
    | "tools"
    | "tool"
    | "artifacts"
    | "artifact"
    | "diff";
  sessionID?: string;
  type?: string;
  id?: string;
  path?: string;
  revision?: "initial" | "final";
  offset?: number;
  limit?: number;
  encoding?: "utf8" | "base64";
};

/** Read-only capabilities shared by recorded archives and fixed live prefixes. */
export interface EvidenceReader {
  summary(): Record<string, unknown>;
  query(input: EvidenceQuery): Promise<Record<string, unknown>>;
}
export interface EvidenceView extends EvidenceReader {
  readonly checkpoint: EvidenceCheckpoint;
}
export interface EvidenceFeed {
  /** Wait for meaningful evidence; coalesce pending changes to the latest prefix. */
  next(after: number, signal: AbortSignal): Promise<EvidenceView | undefined>;
}
export interface JudgeSession {
  check(evidence: EvidenceView, signal: AbortSignal): Promise<EarlyDecision>;
  grade(evidence: EvidenceView, signal: AbortSignal): Promise<Judgment>;
}
