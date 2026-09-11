import type { EvalRun, EvidenceRef } from "../types";

/** A time limit ends execution, but recorded work can still satisfy the rubric. */
export function canJudgeEval(
  run: EvalRun | undefined,
): run is EvalRun & { evidence: EvidenceRef } {
  return (
    !!run?.evidence && ["completed", "stopped", "timed_out"].includes(run.state)
  );
}
