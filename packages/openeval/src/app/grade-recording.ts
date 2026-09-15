import { resolve } from "node:path";
import type {
  JudgeRunInput,
  Judgment,
  OpenCodeStreamEvent,
  SessionArchive,
} from "../types";
import type { CodeJudgeExecution } from "../judge-context";
import type { RecordingInput } from "../infra/recording";
import { executeCodeJudge } from "../infra/judging/code";
import { codeJudgment, combineJudgments } from "../infra/judging/code-result";
import { executeJudge } from "../infra/judging";
import { errorMessage } from "../infra/files";

export type GradedRecording = {
  state: "completed" | "failed" | "timed_out";
  judgment?: Judgment;
  session?: SessionArchive;
  code?: CodeJudgeExecution;
  error?: string;
};

/** Both source files contribute to one judgment over the same finalized recording. */
export async function gradeRecording(
  input: JudgeRunInput,
  recording: RecordingInput,
  directory: string,
  onEvent: (event: OpenCodeStreamEvent) => void,
  evaluateLlm: typeof executeJudge = executeJudge,
): Promise<GradedRecording> {
  let code: CodeJudgeExecution | undefined, session: SessionArchive | undefined;
  try {
    const judgments: Judgment[] = [];
    if (input.code) {
      code = await executeCodeJudge(
        input.code,
        recording,
        resolve(directory, "code"),
        input.timeoutMs,
      );
      if (code.state !== "completed")
        return { state: code.state, code, error: code.error };
      const judged = codeJudgment(code.output!);
      for (const id of Object.keys(judged.scores))
        if (input.criteria.some((criterion) => criterion.id === id))
          throw new Error(
            `Duplicate criterion ID from judge.md and judge.ts: ${id}`,
          );
      judgments.push(judged);
    }
    if (input.rubric) {
      const graded = await evaluateLlm(input, directory, onEvent);
      session = graded.session;
      if (graded.result.state !== "completed" || !graded.judgment)
        return {
          state: "failed",
          code,
          session,
          error: graded.result.error ?? "LLM judge did not submit scores",
        };
      judgments.push(graded.judgment);
    }
    return {
      state: "completed",
      code,
      session,
      judgment: combineJudgments(...judgments),
    };
  } catch (error) {
    return { state: "failed", code, session, error: errorMessage(error) };
  }
}
