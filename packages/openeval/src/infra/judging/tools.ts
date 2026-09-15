import type { OpenCode } from "@opencode/sdk";
import { Schema } from "effect";
import type { EvidenceView } from "../../evidence";
import type { JudgeRunInput } from "../../types";
import type { EvidenceQueryAudit } from "../evidence";
import { JUDGE_TOOLS } from "./agent";
import { evidenceTool, toolResult } from "./evidence-tool";
import { criteriaSchema, STRICT_OBJECT } from "./contract";
import {
  JudgeRequest,
  type JudgePhase,
  type SubmissionAudit,
} from "./submission";

/** Tools capture a fixed request at registry reload, including its evidence view.
 * https://opencode.ai/v2/docs/build/plugins/#tools
 */
export async function installJudgeTools(
  host: OpenCode.Interface,
  directory: string,
  input: Pick<JudgeRunInput, "criteria" | "websearch">,
  queries: EvidenceQueryAudit[],
  submissions: SubmissionAudit[],
) {
  const criteria = input.criteria;
  if (!criteria.length) throw new Error("Declare at least one judge criterion");
  const allowed = new Set(
    JUDGE_TOOLS.filter(
      (tool) => input.websearch || !["websearch", "webfetch"].includes(tool),
    ),
  );
  let active: JudgeRequest | undefined,
    reload: (() => Promise<void>) | undefined;
  await host.plugin({
    id: "judge-tools",
    async setup(context) {
      reload = () => context.tool.reload();
      await context.tool.transform((tools) => {
        for (const tool of tools.list()) {
          if (!allowed.has(tool.id)) tools.remove(tool.id);
          else
            tools.update(tool.id, (tool) => {
              tool.options = { ...tool.options, codemode: true, pinned: true };
            });
        }
        const request = active;
        if (!request || request.closed) return;
        const options = { codemode: true as const, pinned: true };
        // Keep catalog shapes stable across a persistent session. The current
        // phase and ID are data from judge_context, checked by the request owner.
        const requestId = Schema.NonEmptyString;
        const receipt = Schema.Struct({ accepted: Schema.Literal(true) });
        tools.add(
          evidenceTool(request.evidence, queries, {
            active: () => request.assertActive(),
            audit: () => ({
              checkId: request.checkId,
              checkpoint: request.evidence.checkpoint,
            }),
          }),
        );
        tools.add({
          name: "judge_context",
          options,
          description:
            "Get this request's ID, phase, declared criteria, and current evidence index as structured data. Read this at the start of each judge turn.",
          input: Schema.Struct({}).annotate(STRICT_OBJECT),
          output: Schema.Struct({
            requestId: Schema.String,
            phase: Schema.Literals(["early", "final"]),
            criteria: Schema.Array(
              Schema.Struct({ id: Schema.String, name: Schema.String }),
            ),
            evidence: Schema.Record(Schema.String, Schema.Unknown),
          }),
          async execute() {
            return toolResult(request.context());
          },
        });
        tools.add({
          name: "submit_judgment",
          options,
          description:
            "Submit all criterion scores for this fixed evidence view. Values, required criterion IDs, citations, and exact quotes are validated before acceptance. Errors are returned to you; correct the arguments and call again. An early submission must be irreversible for every criterion. After acceptance, finish your turn.",
          input: Schema.Struct({
            requestId,
            scores: criteriaSchema(criteria),
          }).annotate(STRICT_OBJECT),
          output: receipt,
          async execute(value) {
            return toolResult(await request.submit(value));
          },
        });
        tools.add({
          name: "continue_judging",
          options,
          description:
            "Finish this early check when more evidence is needed. Explain what is missing. This does not stop or steer the candidate. After acceptance, finish your turn.",
          input: Schema.Struct({
            requestId,
            reason: Schema.NonEmptyString,
          }).annotate(STRICT_OBJECT),
          output: receipt,
          async execute(value) {
            return toolResult(await request.continue(value));
          },
        });
      });
      await context.session.hook("context", (event) => {
        for (const name of Object.keys(event.tools))
          if (name !== "execute" && !allowed.has(name))
            delete event.tools[name];
      });
    },
  });
  await host.plugin.awaitActivation({ location: { directory } });
  if (!reload) throw new Error("Judge tools did not activate");
  return {
    async open(
      evidence: EvidenceView,
      phase: JudgePhase,
      signal?: AbortSignal,
      checkId?: string,
    ) {
      if (active && !active.closed)
        throw new Error("Judge request is still active");
      const request = new JudgeRequest(
        phase,
        evidence,
        criteria,
        submissions,
        checkId,
        signal,
      );
      active = request;
      try {
        await reload!();
        return request;
      } catch (error) {
        request.close();
        throw error;
      }
    },
  };
}
