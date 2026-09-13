import type {
  BenchmarkDefinition,
  BenchmarkRun,
  ModelRef,
  JudgeRunInput,
} from "../types";
import { fingerprint } from "../infra/files";
import { JUDGE_PROTOCOL } from "../judgment";
import { JUDGE_AGENT } from "../infra/judging/agent";
import { candidateModels } from "../infra/opencode/candidate";

/** Declared, candidate-visible inputs. Harness implementation hashes are provenance. */
export function candidateFingerprint(
  definition: BenchmarkDefinition,
  evalId: string,
  model: ModelRef,
  runtime: BenchmarkRun["runtime"],
) {
  const item = definition.evals.find((item) => item.id === evalId)!;
  return fingerprint({
    prompt: item.prompt,
    source: item.sourceHash,
    model,
    image: runtime.imageId,
    candidate: {
      agent: definition.candidate.agent,
      agents: definition.candidate.agents,
      timeoutMs: definition.candidate.timeoutMs,
      websearch: definition.candidate.websearch,
      providers: candidateModels(model, definition.candidate).map((ref) => {
        const [name] = ref.split("#"),
          slash = name.indexOf("/");
        const provider = definition.candidate.providers?.[name.slice(0, slash)];
        const { models, ...settings } = provider ?? {};
        return provider
          ? { ...settings, model: models?.[name.slice(slash + 1)] }
          : undefined;
      }),
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
    agent: JUDGE_AGENT,
    judge: definition.judge,
    protocol: JUDGE_PROTOCOL,
  });
export const savedJudgeFingerprint = (
  input: Pick<
    JudgeRunInput,
    "rubric" | "agent" | "protocol" | "model" | "timeoutMs" | "websearch"
  >,
) =>
  fingerprint({
    rubric: input.rubric,
    agent: input.agent,
    protocol: input.protocol,
    judge: {
      model: input.model,
      timeoutMs: input.timeoutMs,
      websearch: input.websearch,
    },
  });
