import type { EvidenceQuery, EvidenceQueryAudit } from "../evidence";
import type { EvidenceReader } from "../../evidence";
import { Schema } from "effect";
import { STRICT_OBJECT } from "./contract";

/** Preserve JSON-safe structured output and the same text in native transcripts. */
export function toolResult<T>(value: T) {
  const text = JSON.stringify(value);
  return {
    output: JSON.parse(text) as T,
    content: [{ type: "text" as const, text }],
  };
}

export function evidenceTool(
  evidence: EvidenceReader,
  audit: EvidenceQueryAudit[],
  options: {
    active?: () => void;
    audit?: () => Partial<Pick<EvidenceQueryAudit, "checkId" | "checkpoint">>;
  } = {},
) {
  return {
    name: "candidate_evidence",
    options: { codemode: true as const, pinned: true },
    description:
      "Read immutable recorded agent work. Actions: summary; response; events (optional sessionID/type); event (sequence as id); messages; message (id); tools; tool (id); artifacts (path prefix, initial/final revision); artifact (relative path, revision); diff (relative path). Lists use item offsets, full content uses character offsets. Follow next until null. Read tool results and initial/final files to verify behavior. No commands can run and no files can change.",
    input: Schema.Struct({
      action: Schema.Literals([
        "summary",
        "response",
        "events",
        "event",
        "messages",
        "message",
        "tools",
        "tool",
        "artifacts",
        "artifact",
        "diff",
      ]),
      sessionID: Schema.optional(Schema.String),
      type: Schema.optional(Schema.String),
      id: Schema.optional(Schema.String),
      path: Schema.optional(Schema.String),
      revision: Schema.optional(Schema.Literals(["initial", "final"])),
      offset: Schema.optional(
        Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      ),
      limit: Schema.optional(
        Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
      ),
      encoding: Schema.optional(Schema.Literals(["utf8", "base64"])),
    }).annotate(STRICT_OBJECT),
    output: Schema.Record(Schema.String, Schema.Unknown),
    async execute(input: unknown) {
      options.active?.();
      const query = input as EvidenceQuery;
      const entry: EvidenceQueryAudit = {
        sequence: audit.length,
        startedAt: new Date().toISOString(),
        input: structuredClone(query),
        ...options.audit?.(),
      };
      audit.push(entry);
      try {
        const result = toolResult(await evidence.query(query));
        options.active?.();
        entry.result = result.output;
        return result;
      } catch (error) {
        entry.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        entry.completedAt = new Date().toISOString();
      }
    },
  };
}
