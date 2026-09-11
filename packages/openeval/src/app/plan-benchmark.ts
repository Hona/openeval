import type {
  BenchmarkDefinition,
  BenchmarkRun,
  PlanItem,
  Slot,
  ModelRef,
} from "../types";
import type { Results } from "../infra/sqlite";
import { canJudgeEval } from "./eval-state";
import {
  candidateFingerprint,
  judgeFingerprint,
  savedJudgeFingerprint,
} from "./input-fingerprints";
export {
  candidateFingerprint,
  judgeFingerprint,
  savedJudgeFingerprint,
} from "./input-fingerprints";

export const slotId = (evalId: string, model: ModelRef, repetition: number) =>
  `${evalId}:${model}:${repetition}`;

/** Plan only missing or changed work. A failed execution requires an explicit retry. */
export function planBenchmark(
  definition: BenchmarkDefinition,
  runtime: BenchmarkRun["runtime"],
  results: Results,
): PlanItem[] {
  const previous = new Map(results.slots().map((slot) => [slot.id, slot]));
  const judgments = results.judgeRuns();
  return Array.from(
    { length: definition.repetitions },
    (_, index) => index + 1,
  ).flatMap((repetition) =>
    definition.evals.flatMap((evalDefinition) =>
      definition.models.map((model) => {
        const id = slotId(evalDefinition.id, model, repetition),
          old = previous.get(id);
        const candidateHash = candidateFingerprint(
          definition,
          evalDefinition.id,
          model,
          runtime,
        );
        const judgeHash = judgeFingerprint(definition, evalDefinition.id);
        const sameCandidate = old?.candidateHash === candidateHash;
        const sameJudge = old?.judgeHash === judgeHash;
        const slot: Slot = {
          id,
          evalId: evalDefinition.id,
          model,
          repetition,
          candidateHash,
          judgeHash,
          active: true,
          evalRunId: sameCandidate ? old!.evalRunId : null,
          judgeRunId: sameCandidate && sameJudge ? old!.judgeRunId : null,
          previousEvalRunId: !sameCandidate
            ? (old?.evalRunId ?? old?.previousEvalRunId)
            : old?.previousEvalRunId,
        };
        if (!slot.evalRunId)
          return {
            slot,
            action: "candidate",
            reason: old
              ? "Candidate inputs changed"
              : "New eval/model/repetition",
          };
        const execution = results.evalRun(slot.evalRunId)!;
        if (!canJudgeEval(execution))
          return {
            slot,
            action: "failed",
            reason: `Candidate ${execution.state}; explicit retry required`,
          };
        if (slot.judgeRunId)
          if (
            results.judgeRun(slot.judgeRunId)?.judgment?.value === null &&
            execution.state === "stopped" &&
            execution.stop
          ) {
            const stopper = results.judgeRun(execution.stop.judgeRunId);
            if (stopper && savedJudgeFingerprint(stopper.input) !== judgeHash)
              return {
                slot: {
                  ...slot,
                  candidateHash,
                  evalRunId: null,
                  judgeRunId: null,
                  previousEvalRunId: execution.id,
                },
                action: "candidate",
                reason:
                  "Previous early stop left insufficient evidence for the revised criterion",
              };
          }
        if (slot.judgeRunId)
          return {
            slot,
            action: "reuse",
            reason: "Candidate inputs and judgment unchanged",
          };
        const failed = judgments.find(
          (run) =>
            run.input.evalRunId === slot.evalRunId &&
            run.input.judgeHash === slot.judgeHash &&
            run.state !== "completed",
        );
        if (failed)
          return {
            slot,
            action: "failed",
            reason: `Judge ${failed.state}; explicit rejudge required`,
          };
        return {
          slot,
          action: "judge",
          reason: !sameJudge
            ? "Judge inputs changed"
            : "Recorded work is ready for judging",
        };
      }),
    ),
  );
}
