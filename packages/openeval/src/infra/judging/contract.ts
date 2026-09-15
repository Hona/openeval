import type {
  EvidenceCitation,
  Judgment,
  CriterionDefinition,
  CriterionScore,
} from "../../types";
import type { EvidenceReader, EvidenceQuery } from "../../evidence";
import { criterionMean, isScored } from "../../judgment";
import { Schema } from "effect";

export const STRICT_OBJECT = {
  parseOptions: { onExcessProperty: "error" as const },
};

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const validScore = (value: unknown) =>
  value === null || typeof value === "boolean" || isScored(value);
const reason = (value: unknown): value is string =>
  typeof value === "string" && !!value.trim();

/** Validate structured tool arguments; criterion meaning remains the judge's job. */
export function validateCriteria(
  value: unknown,
  expected: readonly CriterionDefinition[],
): Judgment {
  if (!object(value))
    throw new Error("scores must be an object keyed by criterion ID");
  const ids = Object.keys(value);
  if (
    ids.length !== expected.length ||
    ids.some((id) => !expected.some((criterion) => criterion.id === id))
  )
    throw new Error(
      `Submit exactly these criterion IDs: ${expected.map((criterion) => criterion.id).join(", ")}`,
    );
  const scores = Object.fromEntries(
    expected.map(({ id }): [string, CriterionScore] => {
      const item = value[id];
      if (
        !object(item) ||
        !validScore(item.value) ||
        !reason(item.reason) ||
        !Array.isArray(item.evidence) ||
        item.evidence.length > 32 ||
        (item.value !== null && !item.evidence.length)
      )
        throw new Error(
          `Criterion ${id} requires a boolean, a value from 0 to 1, or null, a non-empty reason, and 1–32 citations when decided`,
        );
      const evidence = item.evidence.map(parseCitation);
      if (
        item.sources !== undefined &&
        (!Array.isArray(item.sources) ||
          !item.sources.every(
            (url) => typeof url === "string" && /^https?:\/\//.test(url),
          ))
      )
        throw new Error("Criterion sources must be HTTP(S) URLs");
      return [
        id,
        {
          value:
            typeof item.value === "boolean"
              ? Number(item.value)
              : (item.value as number | null),
          reason: item.reason,
          evidence,
          source: "judge.md",
          ...(item.sources ? { sources: [...(item.sources as string[])] } : {}),
        },
      ];
    }),
  );
  return {
    value: criterionMean(scores),
    reason: Object.entries(scores)
      .map(([id, score]) => `${id}: ${score.reason}`)
      .join("\n"),
    scores,
  };
}

function parseCitation(value: unknown): EvidenceCitation {
  if (
    !object(value) ||
    !["response", "tool", "message", "event", "artifact", "metric"].includes(
      String(value.kind),
    )
  )
    throw new Error("Invalid evidence citation kind");
  if (
    value.quote !== undefined &&
    (typeof value.quote !== "string" || value.quote.length > 2000)
  )
    throw new Error("Citation quote must be at most 2000 characters");
  if (
    value.offset !== undefined &&
    (!Number.isSafeInteger(value.offset) || (value.offset as number) < 0)
  )
    throw new Error("Invalid citation offset");
  const extra = {
    ...(value.quote !== undefined ? { quote: value.quote as string } : {}),
    ...(value.offset !== undefined ? { offset: value.offset as number } : {}),
  };
  if (value.kind === "response") return { kind: "response", ...extra };
  if (value.kind === "artifact") {
    if (
      !reason(value.path) ||
      !["initial", "final"].includes(String(value.revision))
    )
      throw new Error("Artifact citations require path and revision");
    return {
      kind: "artifact",
      path: value.path,
      revision: value.revision as "initial" | "final",
      ...extra,
    };
  }
  if (!reason(value.id)) throw new Error("Citation requires a recorded ID");
  return {
    kind: value.kind as "tool" | "message" | "event" | "metric",
    id: value.id,
    ...extra,
  };
}

/** Validate references and quoted bytes, never infer whether the task succeeded.
 * https://arxiv.org/html/2607.07946#S7 (evidence-grounded independent audits)
 */
export async function validateCitations(
  judgment: Judgment,
  reader: EvidenceReader,
) {
  for (const [id, score] of Object.entries(judgment.scores))
    for (const citation of score.evidence) {
      const query: EvidenceQuery =
        citation.kind === "recording"
          ? { action: "summary" }
          : citation.kind === "metric"
            ? { action: "metrics", metric: citation.id }
            : citation.kind === "artifact"
              ? {
                  action: "artifact",
                  path: citation.path,
                  revision: citation.revision,
                }
              : citation.kind === "response"
                ? { action: "response" }
                : { action: citation.kind, id: citation.id };
      let offset = citation.offset ?? 0,
        found = false;
      for (let page = 0; page < 100; page++) {
        const result = await reader.query({ ...query, offset, limit: 24000 });
        const text =
          typeof result.text === "string"
            ? result.text
            : JSON.stringify(result);
        if (citation.quote === undefined || text.includes(citation.quote)) {
          found = true;
          break;
        }
        if (typeof result.next !== "number" || result.next <= offset) break;
        offset = Math.max(
          offset + 1,
          result.next - Math.min(citation.quote.length, 2000),
        );
      }
      if (!found)
        throw new Error(`Citation quote was not found for criterion ${id}`);
    }
}

/** The native tool validator exposes these shapes directly in Code Mode. */
export function criteriaSchema(criteria: readonly CriterionDefinition[]) {
  const citationFields = {
    quote: Schema.optional(Schema.String.check(Schema.isMaxLength(2000))),
    offset: Schema.optional(
      Schema.Int.check(
        Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
      ),
    ),
  };
  const citation = Schema.Union([
    Schema.Struct({
      ...citationFields,
      kind: Schema.Literal("response"),
    }).annotate(STRICT_OBJECT),
    Schema.Struct({
      ...citationFields,
      kind: Schema.Literals(["tool", "message", "event", "metric"]),
      id: Schema.NonEmptyString,
    }).annotate(STRICT_OBJECT),
    Schema.Struct({
      ...citationFields,
      kind: Schema.Literal("artifact"),
      path: Schema.NonEmptyString,
      revision: Schema.Literals(["initial", "final"]),
    }).annotate(STRICT_OBJECT),
  ]);
  const decision = Schema.Struct({
    value: Schema.NullOr(
      Schema.Union([
        Schema.Boolean,
        Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
      ]),
    ),
    reason: Schema.NonEmptyString,
    evidence: Schema.Array(citation).check(
      Schema.isMinLength(0),
      Schema.isMaxLength(32),
    ),
    sources: Schema.optional(
      Schema.Array(Schema.String.check(Schema.isPattern(/^https?:\/\//))),
    ),
  }).annotate(STRICT_OBJECT);
  return Schema.Struct(
    Object.fromEntries(
      criteria.map((criterion) => [
        criterion.id,
        decision.annotate({ description: criterion.name }),
      ]),
    ),
  ).annotate(STRICT_OBJECT);
}
