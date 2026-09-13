import { resolve, relative } from "node:path";
import type { Slot, EvalRun } from "../types";
import type { ExecutionContext } from "./context";
import { executeCandidate } from "../infra/containers/candidate";
import type { EvidenceFeed } from "../evidence";

/** The normal candidate use case: record its inputs, execute, finalize its evidence. */
export async function runEval(
  context: ExecutionContext,
  slot: Slot,
  workspace: string,
  controls: {
    signal?: AbortSignal;
    onEvidence?: (run: EvalRun, feed: EvidenceFeed) => void;
  } = {},
): Promise<EvalRun> {
  const definition = context.definition.evals.find(
    (item) => item.id === slot.evalId,
  )!;
  const run = context.results.startEval(slot, {
    evalId: slot.evalId,
    model: slot.model,
    repetition: slot.repetition,
    prompt: definition.prompt,
    candidateHash: slot.candidateHash,
    sourceHash: definition.sourceHash,
    imageId: context.runtime.imageId,
    timeoutMs: context.definition.candidate.timeoutMs,
    earlyStop: !!controls.onEvidence,
    runtime: context.runtime,
  });
  const directory = resolve(context.directory, "eval-runs", run.id);
  const outcome = await executeCandidate(
    {
      ...context.definition.candidate,
      model: slot.model,
      prompt: definition.prompt,
      workspace,
      prepare: definition.settings.prepare ?? [],
      container: context.definition.container,
      imageId: context.runtime.imageId,
    },
    directory,
    (event) => {
      const record = {
        executionId: run.id,
        stage: "candidate" as const,
        time: new Date().toISOString(),
        event,
      };
      context.results.append(record);
      context.onEvent?.(record);
    },
    {
      signal: controls.signal,
      onEvidence: controls.onEvidence
        ? (feed) => controls.onEvidence!(run, feed)
        : undefined,
    },
  );
  const stop = context.results.evalRun(run.id)?.stop;
  const completed: EvalRun = {
    ...run,
    ...outcome,
    ...(stop
      ? { stop: { ...stop, applied: outcome.state === "stopped" } }
      : {}),
    completedAt: new Date().toISOString(),
    elapsedMs: Date.now() - Date.parse(run.startedAt),
    session: outcome.session
      ? {
          ...outcome.session,
          database: relative(
            context.directory,
            resolve(directory, outcome.session.database),
          ),
        }
      : undefined,
    evidence: outcome.evidence
      ? {
          ...outcome.evidence,
          directory: relative(
            context.directory,
            resolve(directory, outcome.evidence.directory),
          ),
        }
      : undefined,
  };
  context.results.finishEval(completed);
  return completed;
}
