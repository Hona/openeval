import { expect, test } from "bun:test";
import { OpenCode } from "@opencode/sdk";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadBenchmark } from "../../app/load-benchmark";
import { candidateConfiguration, candidateModels } from "./candidate";
import { readArchivedSession } from "./archive";
import { runSession, type SessionResult } from "./session";
import { writeJson } from "../files";

test("runs a selected native agent and worker, retaining both in the archived accounting", async () => {
  const directory = await mkdtemp(
    resolve(
      process.platform === "win32" ? "C:/tmp/opencode" : tmpdir(),
      "openeval-candidate-",
    ),
  );
  const requests: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = (await request.json()) as {
        model: string;
        tools?: unknown[];
        messages: Array<{ role: string; content: string }>;
      };
      if (body.tools?.length) requests.push(body.model);
      const delegate =
        body.tools?.length &&
        body.model === "root" &&
        !body.messages.some((message) => message.role === "tool");
      const delta = delegate
        ? {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: "delegate",
                type: "function",
                function: {
                  name: "subagent",
                  arguments: JSON.stringify({
                    agent: "worker",
                    description: "Find the answer",
                    prompt: "Return the answer 42.",
                  }),
                },
              },
            ],
          }
        : { role: "assistant", content: "The answer is 42." };
      const frame = (delta: unknown, finish_reason: string | null = null) =>
        "data: " +
        JSON.stringify({
          id: "local",
          object: "chat.completion.chunk",
          created: 1,
          model: body.model,
          choices: [{ index: 0, delta, finish_reason }],
          ...(finish_reason
            ? {
                usage: {
                  prompt_tokens: 10,
                  completion_tokens: 5,
                  total_tokens: 15,
                },
              }
            : {}),
        }) +
        "\n\n";
      return new Response(
        frame(delta) +
          frame({}, delegate ? "tool_calls" : "stop") +
          "data: [DONE]\n\n",
        {
          headers: { "content-type": "text/event-stream" },
        },
      );
    },
  });
  try {
    await Bun.write(
      resolve(directory, "evals/answer/prompt.md"),
      "Supply the requested fact.",
    );
    await Bun.write(
      resolve(directory, "evals/answer/judge.md"),
      "## Metric: answer — Answer\nPass if the recorded answer supplies the fact.",
    );
    await Bun.write(
      resolve(directory, "benchmark.ts"),
      "export default " +
        JSON.stringify({
          models: ["local/root"],
          judge: { model: "local/judge" },
          candidate: {
            agent: "coordinator",
            websearch: false,
            agents: {
              coordinator: {
                mode: "primary",
                model: "unused/default",
                system: "Delegate to worker and check the answer.",
              },
              worker: {
                mode: "subagent",
                model: {
                  providerID: "local",
                  model: "worker",
                  variant: "default",
                },
                system: "Solve the delegated task.",
              },
              disabled: { disabled: true, model: "unused/disabled" },
            },
            providers: {
              local: {
                env: ["HOME"],
                package: "@opencode/ai/providers/openai-compatible",
                settings: {
                  baseURL: "http://127.0.0.1:" + server.port + "/v1",
                },
                models: Object.fromEntries(
                  ["root", "worker"].map((id) => [
                    id,
                    { name: id, limit: { context: 100000, output: 1000 } },
                  ]),
                ),
              },
            },
          },
        }) +
        ";",
    );
    const definition = await loadBenchmark(directory);
    expect(candidateModels(definition.models[0], definition.candidate)).toEqual(
      ["local/root", "local/worker#default"],
    );
    const config = resolve(directory, "config"),
      database = resolve(directory, "opencode.db");
    await writeJson(
      resolve(config, "opencode.json"),
      candidateConfiguration(definition.candidate),
    );
    let result: SessionResult;
    {
      await using host = await OpenCode.create({
        database: { path: database },
        events: { persist: true },
        config: { directory: config, project: false },
        plugins: [
          {
            id: "local-only",
            async setup(context) {
              await context.session.hook("http.request", (event) => {
                if (new URL(event.request.url).hostname !== "127.0.0.1")
                  throw new Error("Live model calls are forbidden");
              });
            },
          },
        ],
      });
      result = await runSession(
        host,
        {
          agent: definition.candidate.agent,
          model: definition.models[0],
          directory,
          prompt: definition.evals[0].prompt,
          timeoutMs: 15000,
        },
        () => {},
      );
      expect(result.state).toBe("completed");
      expect(result.text).toContain("42");
      expect(result.sessions).toHaveLength(2);
      const root = result.sessions.find((session) => !session.info.parentID)!;
      const worker = result.sessions.find(
        (session) => session.info.parentID === root.info.id,
      )!;
      expect(root.info.agent).toBe("coordinator");
      expect(root.info.model).toEqual({
        providerID: "local",
        id: "root",
        variant: "default",
      });
      expect(worker.info.agent).toBe("worker");
      expect(worker.info.model).toEqual({
        providerID: "local",
        id: "worker",
        variant: "default",
      });
      expect(requests).toEqual(["root", "worker", "root"]);
      expect(result.accounting?.sessions).toBe(2);
      expect(result.accounting?.tokens.input).toBeGreaterThanOrEqual(30);
      expect(result.accounting?.tokens.output).toBeGreaterThanOrEqual(15);
      const { data: build } = await host.agent.get({
        agentID: "build",
        location: { directory },
      });
      expect(build.system).not.toBe(
        definition.candidate.agents!.coordinator.system,
      );
    }
    const { result: archived } = await readArchivedSession(
      database,
      result.sessions.find((session) => !session.info.parentID)!.info.id,
      () => {},
    );
    expect(archived.state).toBe("completed");
    expect(archived.sessions).toHaveLength(2);
    expect(archived.accounting).toEqual(result.accounting);
  } finally {
    server.stop(true);
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
