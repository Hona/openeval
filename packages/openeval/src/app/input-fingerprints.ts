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

/** Declared, candidate-visible inputs. Harness implementation hashes are provenance.
 * Early stopping is a judge-side policy; the planner re-collects sessions it cut short. */
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
    },
    container: {
      engine: definition.container.engine,
      cpus: definition.container.cpus,
      memoryMiB: definition.container.memoryMiB,
    },
  });
}
/** Only judge.ts can run checks, so the verification runtime never changes an LLM-only judgment. */
export const judgeFingerprint = (
  definition: BenchmarkDefinition,
  evalId: string,
) => {
  const item = definition.evals.find((item) => item.id === evalId)!;
  const verification = item.code ? definition.judge.verification : undefined;
  return fingerprint({
    rubric: item.judge,
    code: item.code?.hash,
    codeIds: item.codeCriteria?.map((criterion) => criterion.id).sort(),
    agent: item.judge ? JUDGE_AGENT : undefined,
    judge: item.judge
      ? { ...definition.judge, verification }
      : { timeoutMs: definition.judge.timeoutMs, verification },
    protocol: JUDGE_PROTOCOL,
  });
};
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
) => {
  const verification = input.code ? input.verification : undefined;
  return fingerprint({
    rubric: input.rubric,
    code: input.code?.hash,
    codeIds: input.codeCriteria?.map((criterion) => criterion.id).sort(),
    agent: input.agent,
    protocol: input.protocol,
    judge: input.rubric
      ? {
          model: input.model,
          timeoutMs: input.timeoutMs,
          websearch: input.websearch,
          verification,
        }
      : { timeoutMs: input.timeoutMs, verification },
  });
};
