import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadBenchmark, modelRef } from "./load-benchmark";
import { parseModel } from "../infra/opencode/session";

test("loads namespaced model IDs and preserves them for OpenCode", async () => {
  const root = await mkdtemp(
    resolve(
      process.platform === "win32" ? "C:/tmp/opencode" : tmpdir(),
      "openeval-model-refs-",
    ),
  );
  try {
    await Bun.write(
      resolve(root, "benchmark.ts"),
      'export default { models: ["example/team/checkpoint#high"], judge: { model: "reviewer/org/family/checkpoint#low" } };',
    );
    await Bun.write(
      resolve(root, "evals/answer/prompt.md"),
      "Answer the question.",
    );
    await Bun.write(
      resolve(root, "evals/answer/judge.md"),
      "## Criterion: correct — Correct answer\nPass when the answer is correct.",
    );

    const benchmark = await loadBenchmark(root);
    expect(parseModel(benchmark.models[0])).toEqual({
      providerID: "example",
      id: "team/checkpoint",
      variant: "high",
    });
    expect(parseModel(benchmark.judge.model!)).toEqual({
      providerID: "reviewer",
      id: "org/family/checkpoint",
      variant: "low",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepts existing unqualified IDs and namespaced IDs without variants", () => {
  expect(parseModel(modelRef("example/checkpoint"))).toEqual({
    providerID: "example",
    id: "checkpoint",
  });
  expect(parseModel(modelRef("example/team/checkpoint"))).toEqual({
    providerID: "example",
    id: "team/checkpoint",
  });
});

test.each([
  "example",
  "/checkpoint",
  "example/",
  "example//checkpoint",
  "example/team/",
  "example/team//checkpoint",
  "example/team/check point",
  "example/team/checkpoint#",
  "example/team/checkpoint#high#low",
  "example/team/checkpoint#high/extra",
])("rejects malformed model reference %s", (value) => {
  expect(() => modelRef(value)).toThrow("Invalid model reference");
});
