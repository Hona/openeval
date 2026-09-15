import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";

test.skipIf(process.platform !== "win32")(
  "a Windows bunx entrypoint can launch a real code-judge worker",
  async () => {
    const root = await mkdtemp("C:/tmp/opencode/bunx-code-judge-");
    try {
      await Bun.write(
        resolve(root, "package.json"),
        JSON.stringify({
          private: true,
          dependencies: { "openeval-launch-fixture": "file:./command" },
        }),
      );
      await Bun.write(
        resolve(root, "command/package.json"),
        JSON.stringify({
          name: "openeval-launch-fixture",
          version: "1.0.0",
          type: "module",
          bin: { "openeval-launch-fixture": "main.ts" },
        }),
      );
      await Bun.write(
        resolve(root, "command/main.ts"),
        `#!/usr/bin/env bun
import { basename, resolve } from "node:path";
import { recordEvidence, judgeEvidence } from ${JSON.stringify(new URL("../../app/judge-evidence.ts", import.meta.url).href)};
const evidence = await recordEvidence({directory: resolve("evidence"), prompt:"Reply with exactly APPLE.", response:"APPLE"});
await Bun.write("judge.ts", 'export default ({response}) => ({scores:{answer:response.text === "APPLE"}});');
const result = await judgeEvidence({evidence, code:resolve("judge.ts"), directory:resolve("judgment")});
console.log(JSON.stringify({parent:basename(process.execPath), state:result.state, score:result.judgment?.scores.answer.value}));
if (result.state !== "completed") process.exitCode = 1;
`,
      );
      // Use the package manager to install the local command shim.
      const install = Bun.spawn(["bun", "install", "--ignore-scripts"], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(await install.exited).toBe(0);
      const command = Bun.spawn(["bunx", "--bun", "openeval-launch-fixture"], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, exit] = await Promise.all([
        new Response(command.stdout).text(),
        new Response(command.stderr).text(),
        command.exited,
      ]);
      expect(exit, stderr).toBe(0);
      expect(JSON.parse(stdout.trim())).toEqual({
        parent: "bunx.exe",
        state: "completed",
        score: 1,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  30_000,
);
