import type { SessionMessageInfo } from "@opencode/client";
import type { SessionStage } from "../view";
import type { ViewerEvidence } from "../viewer-export";

const withheld = "[withheld from public export]";
const privateKey =
  /^(?:authorization|proxyauthorization|cookie|setcookie|apikey|accesstoken|refreshtoken|clientsecret|password|secret|token|credentials|credential|privatekey)$/i;
const providerState =
  /^(?:providerState|providerResultState|providerContext|resultState)$/;
const patterns = [
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9_+\/.=-]{8,}/gi,
  /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)\s*["']?\s*[:=]\s*["']?)[^\s"',;<>]{8,}/gi,
  /(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi,
];
export function pick<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Pick<T, K> {
  return Object.fromEntries(
    keys
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]]),
  ) as Pick<T, K>;
}

/** Filter before paging/preview generation. Nothing here edits the retained evidence. */
export class Publication {
  readonly redactions: Record<string, number> = {};
  private readonly secrets: string[];
  constructor(secrets: readonly string[]) {
    const values = new Set<string>();
    for (const secret of secrets.filter((value) => value.length >= 6)) {
      for (const value of [secret, encodeURIComponent(secret)]) {
        values.add(value);
        // A quoted preview or truncated tool output must not expose key fragments.
        if (value.length > 16)
          for (let i = 0; i <= value.length - 16; i++)
            values.add(value.slice(i, i + 16));
      }
    }
    this.secrets = [...values].sort((a, b) => b.length - a.length);
  }
  omit(reason: string) {
    this.redactions[reason] = (this.redactions[reason] ?? 0) + 1;
  }
  text(value: string, depth = 0): string {
    if (depth > 100)
      throw new Error("Public data exceeds the supported nesting depth");
    let text = value;
    for (const secret of this.secrets)
      if (text.includes(secret)) {
        this.omit("known-credential");
        text = text.replaceAll(secret, withheld);
      }
    for (const pattern of patterns)
      text = text.replace(pattern, () => {
        this.omit("credential-pattern");
        return withheld;
      });
    text = text.replace(/\b[A-Za-z]:[\\/][^\s"'<>`]*/g, () => {
      this.omit("host-path");
      return "[local path]";
    });
    text = text.replace(/\/(?:Users|home)\/[^\s/"'<>]+/g, () => {
      this.omit("host-path");
      return "/[home]";
    });
    // Tool outputs often contain serialized JSON; filter its fields before publishing it.
    if (/^\s*[\[{]/.test(text)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return text;
      }
      const filtered = this.json(parsed, depth + 1);
      if (JSON.stringify(parsed) !== JSON.stringify(filtered))
        return JSON.stringify(filtered, null, 2);
    }
    return text;
  }
  json<T>(value: T, depth = 0): T {
    const visit = (item: unknown, depth: number): unknown => {
      if (depth > 100)
        throw new Error("Public data exceeds the supported nesting depth");
      if (typeof item === "string") return this.text(item, depth + 1);
      if (typeof item === "number" && !Number.isFinite(item))
        throw new Error("Public data contains a non-finite number");
      if (Array.isArray(item))
        return item.map((entry) => visit(entry, depth + 1));
      if (!item || typeof item !== "object") return item;
      const result: Record<string, unknown> = Object.create(null);
      for (const [key, entry] of Object.entries(item)) {
        if (entry === undefined) continue;
        if (providerState.test(key)) {
          this.omit("provider-state");
          continue;
        }
        if (privateKey.test(key.replaceAll(/[-_]/g, ""))) {
          this.omit("credential-field");
          result[key] = withheld;
          continue;
        }
        result[this.text(key, depth + 1)] = visit(entry, depth + 1);
      }
      return result;
    };
    return visit(value, depth) as T;
  }
  session(stage: SessionStage): SessionStage {
    return this.json({
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
          if (message.metadata) this.omit("message-metadata");
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
                  if (part.state) this.omit("provider-state");
                  return part.type === "reasoning"
                    ? pick(part, ["type", "text", "time"])
                    : pick(part, ["type", "text"]);
                }
                const state = { ...part.state };
                if (state.status === "streaming") {
                  this.omit("incomplete-tool-input");
                  state.input = withheld;
                } else if ("content" in state && state.content)
                  state.content = state.content.map((content) => {
                    if (content.type === "text") return content;
                    this.omit("attachment");
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
            this.omit("attachment");
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
  evidence(input: ViewerEvidence): ViewerEvidence {
    const data = this.json({
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
          Object.entries(record.event.data).filter(([key]) =>
            keys.includes(key),
          ),
        );
        if (/\.(?:delta|input\.started)$/.test(record.event.type)) {
          this.omit("stream-fragment");
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
        return {
          ...record,
          event: { type: record.event.type, data: eventData },
        };
      }),
    });
    data.summary.responsePreview = data.response.slice(0, 1200);
    return data;
  }
  assertClean(text: string) {
    if (this.secrets.some((secret) => text.includes(secret)))
      throw new Error(
        "Publication blocked: a known credential or credential fragment remains",
      );
    for (const pattern of patterns.slice(0, 4)) {
      pattern.lastIndex = 0;
      if (pattern.test(text))
        throw new Error("Publication blocked: a credential pattern remains");
    }
  }
}
