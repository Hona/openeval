import { resolve, relative } from "node:path";
import type { EvalRun, JudgeRun } from "../types";
import type { ExecutionContext } from "./context";
import { gradeRecording } from "./grade-recording";
import { errorMessage } from "../infra/files";
import { canJudgeEval } from "./eval-state";
import { JUDGE_PROTOCOL } from "../judgment";
import { JUDGE_AGENT } from "../infra/judging/agent";

/** A new grading execution becomes active only after all present judges succeed. */
export async function judgeEvalRun(
  context: ExecutionContext,
  candidate: EvalRun,
  monitoring: Pick<JudgeRun, "monitorError" | "monitorErrorAt"> = {},
): Promise<JudgeRun> {
  if (!canJudgeEval(candidate))
    throw new Error("Judging requires finalized candidate evidence");
  const slot = context.results.slot(candidate.slotId)!;
  const definition = context.definition.evals.find(
    (item) => item.id === slot.evalId,
  )!;
  const run = context.results.startJudge({
    evalRunId: candidate.id,
    evidence: candidate.evidence,
    rubric: definition.judge,
    agent: definition.judge ? JUDGE_AGENT : undefined,
    model: definition.judge ? context.definition.judge.model : undefined,
    kind: definition.code ? (definition.judge ? "hybrid" : "code") : "llm",
    code: definition.code,
    judgeHash: slot.judgeHash,
    timeoutMs: context.definition.judge.timeoutMs,
    websearch: context.definition.judge.websearch,
    mode: "final",
    runtimeHash: context.runtime.judgeHash,
    protocol: JUDGE_PROTOCOL,
    criteria: definition.criteria,
  });
  const directory = resolve(context.directory, "judge-runs", run.id);
  let completed: JudgeRun;
  try {
    const graded = await gradeRecording(
      {
        ...run.input,
        evidence: {
          ...run.input.evidence,
          directory: resolve(context.directory, run.input.evidence.directory),
        },
      },
      {
        evidence: {
          ...candidate.evidence,
          directory: resolve(context.directory, candidate.evidence.directory),
        },
        run: candidate,
        runDirectory: context.directory,
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
      state: graded.state,
      judgment: graded.judgment,
      code: graded.code
        ? {
            ...graded.code,
            stdout: relative(context.directory, graded.code.stdout),
            stderr: relative(context.directory, graded.code.stderr),
          }
        : undefined,
      session: graded.session
        ? {
            ...graded.session,
            database: relative(
              context.directory,
              resolve(directory, graded.session.database),
            ),
          }
        : undefined,
      error: graded.error,
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
