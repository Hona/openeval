import type { SessionMessageInfo } from "@opencode/client";
import type { SessionStage } from "../view";
import type { EvidenceDocument } from "../evidence-query";
import type { CandidateEvidence } from "./evidence";
import type { Publication } from "./publishing";

type Policy = Pick<Publication, "json" | "omit">;
const pick = <T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Pick<T, K> =>
  Object.fromEntries(
    keys
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]]),
  ) as Pick<T, K>;

/** Publication selects artifacts; the evidence store only provides ordinary reads. */
export async function publicationDocument(
  source: CandidateEvidence,
  allowedArtifacts: readonly string[] = [],
): Promise<EvidenceDocument> {
  const artifacts: EvidenceDocument["artifacts"] = { initial: [], final: [] };
  for (const revision of ["initial", "final"] as const) {
    for (const file of source.manifest[revision]?.files ?? []) {
      if (!allowedArtifacts.includes(file.path)) continue;
      if (file.symlink !== undefined || file.bytes > 1024 * 1024)
        throw new Error(
          `Public artifact must be UTF-8 text of at most 1 MiB: ${file.path}`,
        );
      artifacts[revision].push({
        path: file.path,
        bytes: file.bytes,
        sha256: file.sha256,
        text: new TextDecoder("utf-8", { fatal: true }).decode(
          await source.readFile(file.path, revision),
        ),
      });
    }
  }
  return { ...source.document(), artifacts };
}

/** OpenCode-specific projection. The filtering policy has no OpenCode dependency. */
export function publishSession(
  stage: SessionStage,
  policy: Policy,
): SessionStage {
  return policy.json({
    prompt: stage.prompt,
    model: stage.model,
    sessions: stage.sessions.map((session) => ({
      ...pick(session, [
        "sessionID",
        "title",
        "parentID",
        "created",
        "model",
        "agent",
        "status",
      ]),
      diffs: [],
      parts: {},
      messages: session.messages.map((message) => {
        if (message.metadata) policy.omit("message-metadata");
        if (message.type === "assistant")
          return {
            ...pick(message, [
              "type",
              "id",
              "time",
              "agent",
              "model",
              "finish",
              "cost",
              "tokens",
              "error",
              "retry",
            ]),
            content: message.content.map((part) => {
              if (part.type !== "tool") {
                if (part.state) policy.omit("provider-state");
                return part.type === "reasoning"
                  ? pick(part, ["type", "text", "time"])
                  : pick(part, ["type", "text"]);
              }
              const state = { ...part.state };
              if (state.status === "streaming")
                state.input = policy.omit("incomplete-tool-input");
              else if ("content" in state && state.content)
                state.content = state.content.map((content) => {
                  if (content.type === "text") return content;
                  policy.omit("attachment");
                  return {
                    type: "text" as const,
                    text: "[Attachment omitted from public export]",
                  };
                }) as typeof state.content;
              return {
                ...pick(part, ["type", "id", "name", "time", "executed"]),
                state,
              };
            }),
          };
        if (message.type === "user" && message.files?.length)
          policy.omit("attachment");
        const keys = [
          "type",
          "id",
          "time",
          "text",
          "description",
          "skill",
          "name",
          "agent",
          "model",
          "previous",
          "location",
          "shellID",
          "command",
          "status",
          "exit",
          "output",
          "summary",
          "recent",
          "reason",
          "cost",
          "tokens",
          "error",
        ];
        return Object.fromEntries(
          Object.entries(message).filter(([key]) => keys.includes(key)),
        ) as SessionMessageInfo;
      }),
    })),
  });
}

export function publishEvidence(
  input: EvidenceDocument,
  policy: Policy,
): EvidenceDocument {
  const data = policy.json({
    ...input,
    events: input.events.map((record) => {
      const keys = [
        "sessionID",
        "assistantMessageID",
        "id",
        "name",
        "agent",
        "model",
        "parentID",
        "title",
        "ordinal",
        "text",
        "input",
        "content",
        "error",
        "executed",
        "finish",
        "status",
        "inboxID",
        "item",
        "reason",
        "attempt",
        "time",
        "output",
        "duration",
        "usage",
      ];
      const eventData = Object.fromEntries(
        Object.entries(record.event.data).filter(([key]) => keys.includes(key)),
      );
      if (/\.(?:delta|input\.started)$/.test(record.event.type)) {
        policy.omit("stream-fragment");
        return {
          ...record,
          event: {
            type: record.event.type,
            data: {
              ...pick(eventData, [
                "sessionID",
                "assistantMessageID",
                "id",
                "ordinal",
              ]),
              publication:
                "Incremental content omitted; complete messages and tools are available.",
            },
          },
        };
      }
      return { ...record, event: { type: record.event.type, data: eventData } };
    }),
  });
  data.summary.responsePreview = data.response.slice(0, 1200);
  return data;
}
