import type { BenchmarkDefinition, BenchmarkRun, PlanItem } from "../types";
import type { Results } from "../infra/sqlite";
import { candidateFingerprint, judgeFingerprint } from "./input-fingerprints";

/** Explicit IDs only: do not recollect fully scored or superseded recordings. */
export function retryPlan(
  definition: BenchmarkDefinition,
  runtime: BenchmarkRun["runtime"],
  results: Results,
  evalRunIds: readonly string[],
): PlanItem[] {
  if (!evalRunIds.length || new Set(evalRunIds).size !== evalRunIds.length)
    throw new Error("Select unique EvalRun IDs to retry");
  return evalRunIds.map(id => {
    const previous = results.evalRun(id);
    const slot = previous && results.slot(previous.slotId);
    if (!previous || !slot?.active || slot.evalRunId !== previous.id)
      throw new Error("Select the active EvalRun for each repetition");
    const judge = slot.judgeRunId && results.judgeRun(slot.judgeRunId);
    const unresolved = judge && judge.state === "completed" &&
      Object.values(judge.judgment?.scores ?? {}).some(score => score.value === null);
    if (previous.state === "running" || (previous.state === "completed" && !unresolved))
      throw new Error("Select failed, stopped, timed-out, or completed-but-unresolved work");
    const item = definition.evals.find(item => item.id === slot.evalId);
    if (!item || item.prompt !== previous.input.prompt || item.sourceHash !== previous.input.sourceHash ||
        runtime.imageId !== previous.input.imageId)
      throw new Error("Task inputs or image changed; use scoped run for changed work");
    // The current authored time limit may replace an older limit. Other inputs must match.
    const recordedLimits = {
      ...definition,
      evals: definition.evals.map(value => value.id === item.id ? {
        ...value, settings: { ...value.settings,
          candidate: { ...value.settings.candidate, timeoutMs: previous.input.timeoutMs } },
      } : value),
    };
    if (candidateFingerprint(recordedLimits, slot.evalId, slot.model, runtime) !== previous.input.candidateHash)
      throw new Error("Candidate inputs other than the time limit changed");
    return {
      action: "candidate",
      reason: previous.state === "completed" ? "Explicit retry of unresolved recorded work" : "Explicit retry of interrupted or failed work",
      slot: { ...slot,
        candidateHash: candidateFingerprint(definition, slot.evalId, slot.model, runtime),
        judgeHash: judgeFingerprint(definition, slot.evalId),
      },
    };
  });
}
