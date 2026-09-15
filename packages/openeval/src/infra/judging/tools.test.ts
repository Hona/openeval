import { expect, test } from "bun:test";
import { OpenCode } from "@opencode/sdk";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { EvidenceView } from "../../evidence";
import type { EvidenceQueryAudit } from "../evidence";
import { runSession } from "../opencode/session";
import { JUDGE_AGENT, judgeConfiguration, judgePrompt } from "./agent";
import { installJudgeTools } from "./tools";
import type { SubmissionAudit } from "./submission";

const response = (delta: unknown, finish: string) => {
  const frame = (delta: unknown, finish_reason: string | null = null) =>
    "data: " +
    JSON.stringify({
      id: "local",
      object: "chat.completion.chunk",
      created: 1,
      model: "judge",
      choices: [{ index: 0, delta, finish_reason }],
    }) +
    "\n\n";
  return new Response(frame(delta) + frame({}, finish) + "data: [DONE]\n\n", {
    headers: { "content-type": "text/event-stream" },
  });
};

test("Code Mode validates submissions and repairs mistakes within one native turn", async () => {
  const directory = await mkdtemp(
    resolve(
      process.platform === "win32" ? "C:/tmp/opencode" : tmpdir(),
      "openeval-judge-tools-",
    ),
  );
  const failures: string[] = [],
    seenErrors: string[] = [],
    catalogs: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = (await request.json()) as {
        tools?: unknown[];
        messages: Array<{ role: string; content: string }>;
      };
      if (!body.tools?.length)
        return response(
          { role: "assistant", content: "Local verification" },
          "stop",
        );
      const lastUser = body.messages.findLastIndex(
        (message) => message.role === "user",
      );
      const prompt = body.messages[lastUser].content;
      const early = prompt.includes("Early check");
      if (prompt !== judgePrompt(early ? "early" : "final"))
        failures.push("Request data was embedded in user text");
      const outputs = body.messages
        .slice(lastUser + 1)
        .filter((message) => message.role === "tool")
        .map((message) => message.content);
      const token = outputs[0]?.match(/"requestId"\s*:\s*"([^"]+)"/)?.[1];
      let code: string;
      if (!outputs.length)
        code =
          'const context = await tools.judge_context({}); await tools.candidate_evidence({action:"response"}); return context;';
      else if (early && outputs.length === 1)
        code = `return await tools.continue_judging({requestId:${JSON.stringify(token)},reason:"Need the final evidence"});`;
      else if (!early && outputs.length <= 3) {
        if (outputs.length > 1) seenErrors.push(outputs.at(-1)!);
        const value = outputs.length === 1 ? "pass" : 1;
        const quote = outputs.length === 2 ? "invented quote" : "Ready";
        code = `return await tools.submit_judgment(${JSON.stringify({ requestId: token, scores: { answer: { value, reason: "Recorded response", evidence: [{ kind: "response", quote }] } } })});`;
      } else {
        if (!/"accepted"\s*:\s*true/.test(outputs.at(-1)!))
          failures.push("The accepted receipt was not delivered");
        // Deliberately contradict the accepted tool result: prose must never replace it.
        return response(
          {
            role: "assistant",
            content: '{"value":0,"reason":"Unstructured final text"}',
          },
          "stop",
        );
      }
      return response(
        {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: `call_${early ? "early" : "final"}_${outputs.length}`,
              type: "function",
              function: {
                name: "execute",
                arguments: JSON.stringify({ code }),
              },
            },
          ],
        },
        "tool_calls",
      );
    },
  });
  try {
    const input = {
      agent: JUDGE_AGENT,
      rubric:
        "## Criterion: answer — Answer\nPass if the recorded response is ready.",
      criteria: [{ id: "answer", name: "Answer" }],
      websearch: false as const,
    };
    const config = await judgeConfiguration(input, directory);
    await using host = await OpenCode.create({
      database: { path: resolve(directory, "opencode.db") },
      events: { persist: true },
      config: {
        ...config,
        content: JSON.stringify({
          providers: {
            local: {
              env: ["HOME"],
              package: "@opencode/ai/providers/openai-compatible",
              settings: { baseURL: `http://127.0.0.1:${server.port}/v1` },
              models: {
                judge: {
                  name: "Local fixture",
                  limit: { context: 100000, output: 1000 },
                },
              },
            },
          },
        }),
      },
      plugins: [
        {
          id: "local-only",
          async setup(context) {
            await context.session.hook("http.request", (event) => {
              if (new URL(event.request.url).hostname !== "127.0.0.1")
                throw new Error("Live model calls are forbidden");
            });
            await context.session.hook("context", (event) => {
              catalogs.push(event.system.map((part) => part.text).join("\n"));
            });
          },
        },
      ],
    });
    const evidence: EvidenceView = {
      checkpoint: {
        directory: "evidence",
        hash: "snapshot",
        revision: 1,
        through: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      summary: () => ({ coverage: "recorded-session", checkpoint: undefined }),
      query: async () => ({ text: "Ready", next: null }),
    };
    const queries: EvidenceQueryAudit[] = [],
      submissions: SubmissionAudit[] = [];
    const tools = await installJudgeTools(
      host,
      directory,
      input,
      queries,
      submissions,
    );
    let sessionId: string | undefined, after: number | undefined;
    for (const phase of ["early", "final"] as const) {
      const request = await tools.open(evidence, phase);
      try {
        const result = await runSession(
          host,
          {
            model: "local/judge",
            agent: JUDGE_AGENT.id,
            directory,
            timeoutMs: 15000,
            sessionId,
            after,
            prompt: judgePrompt(phase),
          },
          (event) => {
            if ("durable" in event)
              after = Math.max(after ?? -1, event.durable.seq);
          },
        );
        sessionId ??= result.sessions[0].info.id;
        expect(result.state).toBe("completed");
        expect(result.sessions).toHaveLength(1);
        if (phase === "early")
          expect(request.result()).toEqual({
            kind: "continue",
            reason: "Need the final evidence",
          });
        else {
          expect(request.result()).toMatchObject({
            kind: "decided",
            judgment: { value: 1 },
          });
          expect(result.text).toContain('"value":0');
          expect(
            result.sessions[0].messages.filter(
              (message) => message.type === "user",
            ),
          ).toHaveLength(2);
        }
      } finally {
        request.close();
      }
    }
    expect(failures).toEqual([]);
    expect(seenErrors).toHaveLength(2);
    expect(seenErrors[0]).toContain(
      'Invalid arguments for tool "submit_judgment"',
    );
    expect(seenErrors[0]).toContain("scores.answer.value");
    expect(seenErrors[1]).toContain("quote was not found");
    expect(submissions).toHaveLength(3); // Native schema rejection happens before the handler.
    expect(submissions[1].error).toContain("quote was not found");
    expect(
      catalogs.every(
        (text) =>
          text.includes("tools.submit_judgment") &&
          text.includes("tools.judge_context"),
      ),
    ).toBe(true);
    expect(
      catalogs.some((text) => text.includes("tools.continue_judging")),
    ).toBe(true);
    expect(catalogs.at(-1)).toContain("tools.continue_judging");
  } finally {
    server.stop(true);
    await rm(directory, { recursive: true, force: true });
  }
}, 40_000);
