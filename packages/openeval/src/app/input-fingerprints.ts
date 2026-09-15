import type {
  BenchmarkDefinition,
  BenchmarkRun,
  ModelRef,
  JudgeRunInput,
} from "../types";
import { fingerprint } from "../infra/files";
import { JUDGE_PROTOCOL } from "../judgment";
import { JUDGE_AGENT } from "../infra/judging/agent";

/** Declared, candidate-visible inputs. Harness implementation hashes are provenance. */
export function candidateFingerprint(
  definition: BenchmarkDefinition,
  evalId: string,
  model: ModelRef,
  runtime: BenchmarkRun["runtime"],
) {
  const item = definition.evals.find((item) => item.id === evalId)!;
  const [name] = model.split("#"),
    slash = name.indexOf("/");
  const provider = definition.candidate.providers?.[name.slice(0, slash)];
  const { models, ...settings } = provider ?? {};
  return fingerprint({
    prompt: item.prompt,
    source: item.sourceHash,
    model,
    image: runtime.imageId,
    candidate: {
      timeoutMs: definition.candidate.timeoutMs,
      websearch: definition.candidate.websearch,
      provider: provider
        ? { ...settings, model: models?.[name.slice(slash + 1)] }
        : undefined,
    },
    container: {
      engine: definition.container.engine,
      cpus: definition.container.cpus,
      memoryMiB: definition.container.memoryMiB,
    },
  });
}
export const judgeFingerprint = (
  definition: BenchmarkDefinition,
  evalId: string,
) =>
  fingerprint({
    rubric: definition.evals.find((item) => item.id === evalId)!.judge,
    code: definition.evals.find((item) => item.id === evalId)!.code?.hash,
    agent: definition.evals.find((item) => item.id === evalId)!.judge
      ? JUDGE_AGENT
      : undefined,
    judge: definition.evals.find((item) => item.id === evalId)!.judge
      ? definition.judge
      : { timeoutMs: definition.judge.timeoutMs },
    protocol: JUDGE_PROTOCOL,
  });
export const savedJudgeFingerprint = (
  input: Pick<
    JudgeRunInput,
    | "rubric"
    | "agent"
    | "protocol"
    | "model"
    | "timeoutMs"
    | "websearch"
    | "code"
  >,
) =>
  fingerprint({
    rubric: input.rubric,
    code: input.code?.hash,
    agent: input.agent,
    protocol: input.protocol,
    judge: input.rubric
      ? {
          model: input.model,
          timeoutMs: input.timeoutMs,
          websearch: input.websearch,
        }
      : { timeoutMs: input.timeoutMs },
  });
