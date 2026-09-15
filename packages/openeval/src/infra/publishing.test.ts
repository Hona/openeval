import { expect, test } from "bun:test";
import { Publication } from "./publishing";
import { queryViewerEvidence, type ViewerEvidence } from "../viewer-export";
import type { SessionStage } from "../view";

const secret = "demo_canary_6Qh7fR9k2zNt8W4pV5sD";

test("credential scanning accepts syntax grammars while rejecting real authentication shapes", () => {
  const policy = new Publication([]);
  const grammar =
    "basic entity.other.attribute-name.html sk-prompt-condition sk-prompt-state-selector";
  expect(policy.text(grammar)).toBe(grammar);
  expect(() => policy.assertClean(grammar)).not.toThrow();
  const basic = `Basic ${Buffer.from("example:private-password").toString("base64")}`;
  expect(policy.text(basic)).toContain("withheld");
  expect(() => policy.assertClean(basic)).toThrow("credential pattern");
  const key = `sk-${"A7x".repeat(16)}`;
  expect(policy.text(key)).toContain("withheld");
  expect(() => policy.assertClean(key)).toThrow("credential pattern");
});

test("public sessions retain real tool results while excluding credentials and provider state", () => {
  const policy = new Publication([secret]);
  const stage: SessionStage = {
    prompt: "Reply with exactly APPLE.",
    model: "local/test",
    sessions: [
      {
        sessionID: "ses_demo",
        title: "A real recording",
        created: 1,
        model: { providerID: "local", id: "test" },
        agent: "build",
        status: { type: "idle" },
        diffs: [],
        parts: {},
        messages: [
          {
            type: "assistant",
            id: "msg_demo",
            time: { created: 1, completed: 2 },
            agent: "build",
            model: { providerID: "local", id: "test" },
            providerState: { opaque: "NEVER_PUBLISH_PROVIDER_STATE" },
            content: [
              {
                type: "reasoning",
                text: `Checking ${secret}`,
                state: { opaque: "NEVER_PUBLISH_REASONING_STATE" },
              },
              {
                type: "tool",
                id: "tool_demo",
                name: "shell",
                time: { created: 1, completed: 2 },
                state: {
                  status: "completed",
                  input: {
                    command: "echo APPLE",
                    headers: { Authorization: `Bearer ${secret}` },
                  },
                  content: [{ type: "text", text: "APPLE" }],
                },
                providerState: { opaque: "NEVER_PUBLISH_TOOL_STATE" },
              },
              { type: "text", text: "APPLE" },
            ],
          },
        ],
      },
    ],
  };
  const before = JSON.stringify(stage);
  const output = policy.session(stage);
  const encoded = JSON.stringify(output);
  expect(encoded).not.toContain(secret);
  expect(encoded).not.toContain("NEVER_PUBLISH");
  expect(encoded).toContain('"command":"echo APPLE"');
  expect(encoded).toContain('"text":"APPLE"');
  expect(encoded).toContain('"completed":2');
  expect(JSON.stringify(stage)).toBe(before);
  policy.assertClean(encoded);
  const serialized = policy.json({
    text: JSON.stringify({
      Cookie: "unlisted-session-cookie",
      providerState: { opaque: "UNLISTED_PRIVATE_STATE" },
      response: "APPLE",
    }),
  });
  expect(serialized.text).not.toContain("unlisted-session-cookie");
  expect(serialized.text).not.toContain("UNLISTED_PRIVATE_STATE");
  expect(serialized.text).toContain("APPLE");
  expect(() => policy.assertClean(`unexpected ${secret}`)).toThrow(
    "Publication blocked",
  );
});

test("publication sanitizes whole values before generating previews or pages", () => {
  const policy = new Publication([secret]);
  const text = "x".repeat(1190) + secret + " APPLE";
  const input = {
    summary: {
      responsePreview: text.slice(0, 1200),
      responseCharacters: text.length,
    },
    response: text,
    messages: [
      {
        id: "m",
        sessionID: "s",
        role: "assistant",
        text,
        firstSequence: 0,
        lastSequence: 2,
        complete: true,
      },
    ],
    events: [...secret].map((delta, sequence) => ({
      sequence,
      time: "2026-01-01T00:00:00Z",
      event: { type: "session.text.delta", data: { sessionID: "s", delta } },
    })),
    tools: [],
    artifacts: { initial: [], final: [] },
    metrics: {
      tokens: { input: 100, output: 5 },
      cost: { usd: 1 },
      evidence: {
        directory: "C:\\Users\\private\\results",
        hash: "a".repeat(64),
      },
    },
  } as unknown as ViewerEvidence;
  const data = policy.evidence(input);
  const json = JSON.stringify(data);
  expect(json).not.toContain(secret);
  expect(json).not.toContain(secret.slice(0, 10));
  expect(json).not.toContain("private");
  expect(data.events.every((event) => !("delta" in event.event.data))).toBe(
    true,
  );
  expect(data.response).toEndWith("APPLE");
  expect(
    queryViewerEvidence(data, { action: "response", offset: 1190 }),
  ).toMatchObject({ text: expect.stringContaining("withheld") });
  expect(queryViewerEvidence(data, { action: "message", id: "m" }).text).toBe(
    data.response,
  );
  expect(
    queryViewerEvidence(data, { action: "metrics", metric: "tokens.input" }),
  ).toMatchObject({ value: 100 });
  expect(() =>
    queryViewerEvidence(data, {
      action: "metrics",
      metric: "__proto__.constructor",
    }),
  ).toThrow();
  expect(() =>
    queryViewerEvidence(data, { action: "artifact", path: "../secret" }),
  ).toThrow();
  expect(() =>
    queryViewerEvidence(data, { action: "events", offset: -1 }),
  ).toThrow();
});
