import { resolve } from "node:path";
import type { EvalRun, JudgeRun, RunEvent } from "../../types";
import type { SessionStage } from "../../view";
import type { RecordedSession } from "./session";
import { emptyStage, applySessionRecord } from "../../session-replay";

export async function readRecording(
  root: string,
  run: EvalRun | JudgeRun,
  records: RunEvent[],
): Promise<SessionStage> {
  const judge = "evalRunId" in run.input;
  const model = run.input.model;
  if (!model)
    throw new Error(
      "Code judges produce JSON output rather than an OpenCode session",
    );
  const stage: SessionStage = {
    ...emptyStage(),
    prompt: "prompt" in run.input ? run.input.prompt : run.input.rubric,
    model,
  };
  const directory = resolve(root, judge ? "judge-runs" : "eval-runs", run.id);
  const saved = Bun.file(resolve(directory, "session.json"));
  if (await saved.exists()) {
    const sessions = (await saved.json()) as RecordedSession[];
    if (sessions.some(({ info }) => !info.agent || !info.model))
      throw new Error("Recorded sessions require an explicit agent and model");
    return {
      ...stage,
      sessions: sessions.map(({ info, messages }) => ({
        sessionID: info.id,
        title: info.title ?? "",
        parentID: info.parentID,
        created: info.time.created,
        model: info.model!,
        agent: info.agent!,
        messages,
        status: { type: "idle" },
        diffs: [],
        parts: {},
      })),
    };
  }
  for (const record of records) applySessionRecord(stage, record);
  return stage;
}
