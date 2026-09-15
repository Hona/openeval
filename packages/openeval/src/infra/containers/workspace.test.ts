import { expect, test } from "bun:test";
import { mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { EvalDefinition } from "../../types";
import { prepareWorkspace } from "./workspace";

test("freezes same-size revision changes with matching source timestamps", async () => {
  const root = await mkdtemp(
    resolve(
      process.platform === "win32" ? "C:/tmp/opencode" : tmpdir(),
      "openeval-revisions-",
    ),
  );
  const before = '{"version":1}\n',
    after = '{"version":2}\n';
  const time = new Date("2026-01-01T00:00:00.000Z");
  try {
    for (const [name, content] of [
      ["main", before],
      ["next", after],
    ]) {
      const path = resolve(root, name, "state.json");
      await Bun.write(path, content);
      await utimes(path, time, time);
    }
    const definition: EvalDefinition = {
      id: "revision-fixture",
      name: "Revision fixture",
      directory: root,
      prompt: "Use the target revision.",
      judge: "## Criterion: state — State\nInspect the state.",
      criteria: [{ id: "state", name: "State" }],
      sourceHash: "fixture",
      judgeHash: "fixture",
      settings: {
        workspace: {
          ref: "main",
          revisions: [
            { ref: "main", directory: "main", message: "Initial state" },
            { ref: "next", directory: "next", message: "Updated state" },
          ],
        },
      },
    };
    const directory = resolve(root, "prepared");
    await prepareWorkspace(definition, directory);
    for (const [ref, expected] of [
      ["main", before],
      ["next", after],
    ]) {
      const result = Bun.spawnSync(
        ["git", "show", `upstream/${ref}:state.json`],
        { cwd: resolve(directory, "checkout") },
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toBe(expected);
    }
    expect(
      await Bun.file(resolve(directory, "checkout/state.json")).text(),
    ).toBe(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
