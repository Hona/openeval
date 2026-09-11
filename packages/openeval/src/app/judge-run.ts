import { resolve, relative } from "node:path";
import type { EvalRun, JudgeRun } from "../types";
import type { ExecutionContext } from "./context";
import { executeJudge } from "../infra/judging";
import { errorMessage } from "../infra/files";
import { canJudgeEval } from "./eval-state";
import { JUDGE_PROTOCOL } from "../judgment";
import { JUDGE_AGENT } from "../infra/judging/agent";

/** A new judge session references existing evidence and becomes active only after success. */
export async function judgeEvalRun(
  context: ExecutionContext,
  candidate: EvalRun,
  monitoring: Pick<JudgeRun, "monitorError" | "monitorErrorAt"> = {},
): Promise<JudgeRun> {
  if (!canJudgeEval(candidate))
    throw new Error(
      "Judging requires finalized evidence from a completed, stopped, or timed-out eval run",
    );
  const slot = context.results.slot(candidate.slotId)!;
  const definition = context.definition.evals.find(
    (item) => item.id === slot.evalId,
  )!;
  const run = context.results.startJudge({
    evalRunId: candidate.id,
    evidence: candidate.evidence,
    rubric: definition.judge,
    agent: JUDGE_AGENT,
    model: context.definition.judge.model,
    judgeHash: slot.judgeHash,
    timeoutMs: context.definition.judge.timeoutMs,
    websearch: context.definition.judge.websearch,
    mode: "final",
    runtimeHash: context.runtime.judgeHash,
    protocol: JUDGE_PROTOCOL,
    metrics: definition.metrics,
  });
  const directory = resolve(context.directory, "judge-runs", run.id);
  let completed: JudgeRun;
  try {
    const { result, session, judgment } = await executeJudge(
      {
        ...run.input,
        evidence: {
          ...run.input.evidence,
          directory: resolve(context.directory, run.input.evidence.directory),
        },
      },
      directory,
      (event) => {
        const record = {
          executionId: run.id,
          stage: "judge" as const,
          time: new Date().toISOString(),
          event,
        };
        context.results.append(record);
        context.onEvent?.(record);
      },
    );
    completed = {
      ...run,
      ...monitoring,
      state: result.state,
      judgment,
      session: {
        ...session,
        database: relative(
          context.directory,
          resolve(directory, session.database),
        ),
      },
      error: result.error,
      completedAt: new Date().toISOString(),
      elapsedMs: Date.now() - Date.parse(run.startedAt),
    };
  } catch (error) {
    completed = {
      ...run,
      ...monitoring,
      state: "failed",
      error: errorMessage(error),
      completedAt: new Date().toISOString(),
      elapsedMs: Date.now() - Date.parse(run.startedAt),
    };
  }
  context.results.finishJudge(completed);
  return completed;
}
