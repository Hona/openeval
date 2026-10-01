import type {
  BenchmarkDefinition,
  BenchmarkRun,
  ModelRef,
  JudgeRunInput,
  ProviderDefinitions,
} from "../types";
import { fingerprint } from "../infra/files";
import { JUDGE_PROTOCOL } from "../judgment";
import { JUDGE_AGENT } from "../infra/judging/agent";

/** The candidate's own provider settings and model override; other entries do not apply to it. */
function providerScope(
  providers: ProviderDefinitions | undefined,
  model: ModelRef,
) {
  const [name] = model.split("#"),
    slash = name.indexOf("/"),
    id = name.slice(0, slash),
    modelId = name.slice(slash + 1);
  const { models, ...settings } = providers?.[id] ?? {};
  const override = models?.[modelId];
  return override || Object.keys(settings).length
    ? { id, modelId, settings, override }
    : undefined;
}

/** Provider configuration installed in one candidate container. */
export function candidateProviders(
  providers: ProviderDefinitions | undefined,
  model: ModelRef,
): ProviderDefinitions | undefined {
  const scope = providerScope(providers, model);
  return scope
    ? {
        [scope.id]: {
          ...scope.settings,
          ...(scope.override
            ? { models: { [scope.modelId]: scope.override } }
            : {}),
        },
      }
    : undefined;
}

/** Declared, candidate-visible inputs. Harness implementation hashes are provenance. */
export function candidateFingerprint(
  definition: BenchmarkDefinition,
  evalId: string,
  model: ModelRef,
  runtime: BenchmarkRun["runtime"],
) {
  const item = definition.evals.find((item) => item.id === evalId)!;
  const scope = providerScope(definition.candidate.providers, model);
  return fingerprint({
    prompt: item.prompt,
    source: item.sourceHash,
    model,
    image: runtime.imageId,
    candidate: {
      timeoutMs: definition.candidate.timeoutMs,
      websearch: definition.candidate.websearch,
      provider: scope && { ...scope.settings, model: scope.override },
      earlyStop: item.settings.earlyStop ?? false,
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
    codeIds: definition.evals.find((item) => item.id === evalId)!.codeCriteria?.map(item => item.id).sort(),
    agent: definition.evals.find((item) => item.id === evalId)!.judge
      ? JUDGE_AGENT
      : undefined,
    judge: definition.evals.find((item) => item.id === evalId)!.judge
      ? definition.judge
      : { timeoutMs: definition.judge.timeoutMs, verification: definition.judge.verification },
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
    | "codeCriteria"
    | "verification"
  >,
) =>
  fingerprint({
    rubric: input.rubric,
    code: input.code?.hash,
    codeIds: input.codeCriteria?.map(item => item.id).sort(),
    agent: input.agent,
    protocol: input.protocol,
    judge: input.rubric
      ? {
          model: input.model,
          timeoutMs: input.timeoutMs,
          websearch: input.websearch,
          verification: input.verification,
        }
      : { timeoutMs: input.timeoutMs, verification: input.verification },
  });
