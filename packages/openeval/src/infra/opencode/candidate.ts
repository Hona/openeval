import type { ConfigEntry } from "@opencode/client";
import type { BenchmarkDefinition, ModelRef } from "../../types";

type Candidate = BenchmarkDefinition["candidate"];

export const candidateConfiguration = (candidate: Candidate) =>
  ({
    default_agent: candidate.agent,
    permissions: [{ action: "*", resource: "*", effect: "allow" }],
    websearch: candidate.websearch ? { provider: candidate.websearch } : false,
    ...(candidate.agents ? { agents: candidate.agents } : {}),
    ...(candidate.providers ? { providers: candidate.providers } : {}),
  }) satisfies Extract<ConfigEntry, { type: "document" }>["info"];

/** The benchmark selects the root model; enabled workers may select their own. */
export function candidateModels(
  model: ModelRef,
  candidate: Candidate,
): ModelRef[] {
  const workers = Object.entries(candidate.agents ?? {}).flatMap(
    ([id, agent]) => {
      if (id === candidate.agent || agent.disabled || !agent.model) return [];
      if (typeof agent.model === "string") return [agent.model as ModelRef];
      return [
        `${agent.model.providerID}/${agent.model.model}${agent.model.variant ? `#${agent.model.variant}` : ""}` as ModelRef,
      ];
    },
  );
  return [...new Set([model, ...workers])];
}
