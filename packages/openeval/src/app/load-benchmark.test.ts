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

test("criteria declare categories in judge.md and judge.ts without changing judge inputs", async () => {
  const root = await mkdtemp(
    resolve(
      process.platform === "win32" ? "C:/tmp/opencode" : tmpdir(),
      "openeval-categories-",
    ),
  );
  const rubric =
    "## Criterion: asks - Asks for the version\nReturn 1 when it asks.";
  const write = (path: string, content: string) =>
    Bun.write(resolve(root, path), content);
  try {
    await write(
      "benchmark.ts",
      'export default { models: ["example/model"], judge: { model: "example/judge" } };',
    );
    for (const id of ["ask", "code", "plain"])
      await write(`evals/${id}/prompt.md`, "Answer the question.");
    await write("evals/ask/judge.md", rubric);
    await write(
      "evals/code/judge.ts",
      'export const criteria = { correct: { name: "Correct answer", categories: ["General", "general"] }, unlabeled: {} };\nexport default () => ({ scores: { correct: true } });',
    );
    await write("evals/plain/judge.md", rubric);
    const before = await loadBenchmark(root);

    await write(
      "evals/ask/judge.md",
      rubric.replace("version\n", "version\nCategories: misalignment, General\n"),
    );
    const after = await loadBenchmark(root);
    const [ask, code] = after.evals;
    expect(ask!.judgeHash).toBe(before.evals[0]!.judgeHash);
    expect(ask!.judge).toBe(rubric);
    expect(ask!.categories).toEqual({ asks: ["misalignment", "General"] });
    expect(code!.codeCriteria).toEqual([
      { id: "correct", name: "Correct answer" },
      { id: "unlabeled", name: "unlabeled" },
    ]);
    expect(code!.categories).toEqual({ correct: ["General"] });

    await write(
      "benchmark.ts",
      'export default { models: ["example/model"], judge: { model: "example/judge" }, categories: ["MISALIGNMENT"] };',
    );
    const composed = await loadBenchmark(root);
    expect(composed.evals.map((item) => item.id)).toEqual(["ask"]);
    expect(composed.categories).toEqual(["MISALIGNMENT"]);

    await write(
      "evals/code/judge.ts",
      'export const criteria = { asks: { categories: ["general"] } };\nexport default () => ({ scores: {} });',
    );
    await write("evals/code/judge.md", rubric);
    await expect(loadBenchmark(root)).rejects.toThrow("not both");
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
