import { resolve, dirname } from "node:path";
import type { EvidenceRef, Judge, JudgeRunInput, ToolCall } from "../types";
import { judgingFingerprint } from "../infra/judging";
import { EvidenceCapture } from "../infra/evidence";
import { JUDGE_PROTOCOL, rubricCriteria } from "../judgment";
import { JUDGE_AGENT } from "../infra/judging/agent";
import { writeJson } from "../infra/files";
import { savedJudgeFingerprint } from "./input-fingerprints";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { compileCodeJudge } from "../infra/judging/code-source";
import { gradeRecording } from "./grade-recording";

/** Inspect retained evidence without changing benchmark selections.
 * Useful for calibration and second opinions: https://arxiv.org/abs/2410.12784
 */
export async function judgeEvidence(options: {
  evidence: EvidenceRef;
  rubric?: string;
  code?: string;
  judge?: Judge;
  directory: string;
}) {
  const directory = resolve(options.directory);
  if (await Bun.file(resolve(directory, "input.json")).exists())
    throw new Error("Choose a new judge evidence directory");
  if (!options.rubric?.trim() && !options.code)
    throw new Error("Provide rubric text, a code judge path, or both");
  if (options.rubric && !options.judge?.model)
    throw new Error("A Markdown rubric requires judge.model");
  const code = options.code ? await compileCodeJudge(options.code) : undefined;
  const request: Omit<JudgeRunInput, "judgeHash"> = {
    evalRunId: "retained-evidence",
    evidence: {
      ...options.evidence,
      directory: resolve(options.evidence.directory),
    },
    rubric: options.rubric ?? "",
    kind: code ? (options.rubric ? "hybrid" : "code") : "llm",
    code,
    agent: options.rubric ? JUDGE_AGENT : undefined,
    model: options.rubric ? options.judge?.model : undefined,
    timeoutMs: options.judge?.timeoutMs ?? 600_000,
    websearch: options.judge?.websearch ?? false,
    criteria: options.rubric ? rubricCriteria(options.rubric) : [],
    protocol: JUDGE_PROTOCOL,
    mode: "final" as const,
    runtimeHash: await judgingFingerprint(),
  };
  const input: JudgeRunInput = {
    ...request,
    judgeHash: savedJudgeFingerprint(request),
  };
  await writeJson(resolve(directory, "input.json"), input);
  const result = await gradeRecording(
    input,
    { evidence: input.evidence },
    directory,
    () => {},
  );
  await writeJson(resolve(directory, "result.json"), result);
  return result;
}

/** Record an explicitly supplied calibration example. No model or tool is executed. */
export async function recordEvidence(options: {
  directory: string;
  prompt: string;
  response: string;
  tools?: ToolCall[];
}): Promise<EvidenceRef> {
  const directory = resolve(options.directory);
  await mkdir(dirname(directory), { recursive: true });
  const workspace = await mkdtemp(resolve(dirname(directory), ".recording-"));
  try {
    const capture = await EvidenceCapture.create(directory);
    const result = await capture.finish({
      prompt: options.prompt,
      response: { text: options.response },
      tools: options.tools ?? [],
      workspace,
    });
    return { directory, hash: result.sha256 };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
