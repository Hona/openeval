import type { ConfigEntry } from "@opencode/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { JudgeRunInput } from "../../types";
import { writeJson } from "../files";

export const JUDGE_TOOLS = [
  "candidate_evidence",
  "judge_context",
  "submit_judgment",
  "continue_judging",
  "websearch",
  "webfetch",
];

/** Native V2 agent profile, also retained as a declared JudgeRun input.
 * https://opencode.ai/v2/docs/agents/#system
 */
export const JUDGE_AGENT = {
  id: "openeval-judge",
  description: "Grades immutable recorded work against eval criteria",
  mode: "primary",
  system: readFileSync(new URL("./judge-agent.md", import.meta.url), "utf8"),
  permissions: [
    { action: "*", resource: "*", effect: "deny" },
    ...["execute", ...JUDGE_TOOLS].map((action) => ({
      action,
      resource: "*",
      effect: "allow" as const,
    })),
  ],
} satisfies JudgeRunInput["agent"];

export async function judgeConfiguration(
  input: Pick<JudgeRunInput, "agent" | "rubric" | "websearch">,
  directory: string,
) {
  if (!input.agent) throw new Error("An LLM judge requires an agent profile");
  const { id, ...agent } = input.agent;
  const configuration = resolve(directory, "configuration");
  const config = {
    $schema: "https://opencode.ai/config.json",
    default_agent: id,
    agents: {
      [id]: {
        ...agent,
        // Keep the rubric in the native system prompt so compaction cannot lose
        // it. Request context and result data move through registered tools.
        system: `${agent.system.trim()}\n\n# Eval rubric\n\n${input.rubric.trim()}`,
      },
    },
    websearch: input.websearch ? { provider: input.websearch } : false,
  } satisfies Extract<ConfigEntry, { type: "document" }>["info"];
  // This isolated native config also archives the exact effective agent prompt.
  await writeJson(resolve(configuration, "opencode.json"), config);
  return { directory: configuration, project: false };
}

export const judgePrompt = (phase: "early" | "final") =>
  phase === "early"
    ? "Early check. Evaluate the current fixed evidence view through the judge tools."
    : "Final grading. Execution has ended. Evaluate the current evidence through the judge tools.";
