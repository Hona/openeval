import { expect, test } from "bun:test";
import { OpenCode } from "@opencode/sdk";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { JUDGE_AGENT, judgeConfiguration } from "./agent";
import { writeJson } from "../files";
import { awaitPluginActivation } from "../opencode/session";

test("loads and selects an isolated native judge agent without modifying build", async () => {
  const directory = await mkdtemp(
    resolve(
      process.platform === "win32" ? "C:/tmp/opencode" : tmpdir(),
      "openeval-judge-agent-",
    ),
  );
  const rubric =
    "## Criterion: answer — Answer\nPass if the recorded answer supplies the requested fact.";
  try {
    const workspace = resolve(directory, "workspace");
    await writeJson(resolve(workspace, "opencode.json"), {
      agents: {
        [JUDGE_AGENT.id]: { system: "Unrelated project instructions" },
      },
    });
    const config = await judgeConfiguration(
      {
        agent: JUDGE_AGENT,
        rubric,
        websearch: false,
      },
      directory,
    );
    await using host = await OpenCode.create({
      database: { path: resolve(directory, "opencode.db") },
      config,
      plugins: [
        {
          id: "no-model-requests",
          async setup(context) {
            await context.session.hook("http.request", () => {
              throw new Error("This test must not call a model");
            });
          },
        },
      ],
    });
    const location = { directory: workspace };
    await awaitPluginActivation(host, location);
    const { data: agent } = await host.agent.get({
      agentID: JUDGE_AGENT.id,
      location,
    });
    expect(agent.mode).toBe("primary");
    // Native defaults precede agent-specific rules; the final matching rule wins.
    // OpenCode's built-in browser plugin can append only deny rules after them.
    const start = agent.permissions.findLastIndex(
      (rule) => rule.action === "*" && rule.effect === "deny",
    );
    expect(
      agent.permissions.slice(start, start + JUDGE_AGENT.permissions.length),
    ).toEqual(JUDGE_AGENT.permissions);
    expect(
      agent.permissions
        .slice(start + JUDGE_AGENT.permissions.length)
        .every((rule) => rule.effect === "deny"),
    ).toBe(true);
    expect(agent.system!.split(JUDGE_AGENT.system.trim())).toHaveLength(2);
    expect(agent.system!.split(rubric)).toHaveLength(2);
    expect(agent.system).not.toContain("Output selection");
    expect(agent.system).not.toContain("Unrelated project instructions");
    const { data: build } = await host.agent.get({
      agentID: "build",
      location,
    });
    expect(build.permissions).not.toEqual(agent.permissions);
    const session = await host.session.create({
      location,
      agent: JUDGE_AGENT.id,
    });
    expect(session.agent).toBe(JUDGE_AGENT.id);
    const archived = await Bun.file(
      resolve(config.directory, "opencode.json"),
    ).json();
    expect(archived.agents[JUDGE_AGENT.id].system).toBe(agent.system);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
