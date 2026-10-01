import type { JsonValue } from "../../judge-context";
import type { CriterionScore, Judgment } from "../../types";
import { criterionMean, isScored } from "../../judgment";
import { parseCitation } from "./contract";

/** Preserve author JSON exactly; reject values JSON would silently discard or coerce. */
export function jsonOutput(
  value: unknown,
  path = "output",
  seen = new Set<object>(),
): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || !value || seen.has(value))
    throw new Error(
      `${path} must be JSON-compatible (no undefined, non-finite numbers, or cycles)`,
    );
  if (
    !Array.isArray(value) &&
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new Error(`${path} must be a plain JSON object`);
  if (Object.getOwnPropertySymbols(value).length)
    throw new Error(`${path} contains a symbol key`);
  seen.add(value);
  try {
    if (Array.isArray(value))
      return Array.from(value, (item, index) =>
        jsonOutput(item, `${path}[${index}]`, seen),
      );
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        jsonOutput(item, `${path}.${key}`, seen),
      ]),
    );
  } finally {
    seen.delete(value);
  }
}

export function codeJudgment(output: JsonValue): Judgment {
  const values =
    output &&
    typeof output === "object" &&
    !Array.isArray(output) &&
    "scores" in output
      ? output.scores
      : {};
  if (!values || typeof values !== "object" || Array.isArray(values))
    throw new Error("output.scores must be an object keyed by criterion ID");
  const scores = Object.fromEntries(
    Object.entries(values).map(([id, supplied]): [string, CriterionScore] => {
      if (!/^[a-z][a-z0-9_]*$/.test(id))
        throw new Error(`Invalid criterion ID: ${id}`);
      const detailed = supplied !== null && typeof supplied === "object" && !Array.isArray(supplied) ? supplied : undefined;
      if (detailed && (Object.keys(detailed).some(key => !["value", "reason", "evidence", "measurements"].includes(key)) ||
        typeof detailed.reason !== "string" || !detailed.reason.trim()))
        throw new Error(`scores.${id} requires a non-empty reason and only value, reason, evidence, and measurements`);
      const raw = detailed ? detailed.value : supplied;
      const value = typeof raw === "boolean" ? Number(raw) : raw;
      if (value !== null && !isScored(value))
        throw new Error(
          `scores.${id} must be a boolean, a finite number from 0 to 1, or null`,
        );
      return [
        id,
        {
          value: value as number | null,
          reason: detailed ? detailed.reason as string :
            value === null
              ? "judge.ts returned an unresolved score."
              : `judge.ts returned ${String(supplied)}.`,
          evidence: detailed?.evidence !== undefined
            ? (() => {
              if (!Array.isArray(detailed.evidence) || detailed.evidence.length > 32)
                throw new Error(`scores.${id}.evidence must contain at most 32 citations`);
              return detailed.evidence.map(parseCitation);
            })()
            : value === null ? [] : [{ kind: "recording" }],
          ...(detailed?.measurements !== undefined ? { measurements: (() => {
            const values = detailed.measurements;
            if (!values || typeof values !== "object" || Array.isArray(values))
              throw new Error(`scores.${id}.measurements must be an object`);
            return values;
          })() } : {}),
          source: "judge.ts",
        },
      ];
    }),
  );
  return {
    scores,
    value: criterionMean(scores),
    reason: Object.keys(scores).length
      ? "Criterion scores computed by judge.ts."
      : "The code judge returned data without criterion scores.",
  };
}

export function combineJudgments(...judgments: Judgment[]): Judgment {
  const scores: Record<string, CriterionScore> = {};
  for (const judgment of judgments)
    for (const [id, score] of Object.entries(judgment.scores)) {
      if (Object.hasOwn(scores, id))
        throw new Error(
          `Duplicate criterion ID from judge.md and judge.ts: ${id}`,
        );
      scores[id] = score;
    }
  return {
    scores,
    value: criterionMean(scores),
    reason: judgments
      .map((judgment) => judgment.reason)
      .filter(Boolean)
      .join("\n"),
  };
}
