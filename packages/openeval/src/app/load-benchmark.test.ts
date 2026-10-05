import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadBenchmark, modelRef } from "./load-benchmark";
import { candidateTimeout } from "./input-fingerprints";
import { parseModel } from "../infra/opencode/session";
import { CANDIDATE_TIMEOUT_MS, MAX_CANDIDATE_TIMEOUT_MS } from "../types";

test("verification workspace capacity is preserved only when explicitly configured", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "openeval-workspace-capacity-"));
  try {
    await Bun.write(resolve(root, "evals/answer/prompt.md"), "Answer.");
    await Bun.write(resolve(root, "evals/answer/judge.md"), "## Criterion: answer — Answer\nPass when correct.");
    const declare = (extra: string) => Bun.write(resolve(root, "benchmark.ts"),
      `export default { models: ["example/model"], judge: { model: "example/judge", verification: { image: "fixture", memoryMiB: 4096, ${extra} } } };`);
    await declare("");
    const original = await loadBenchmark(root);
    expect(Object.hasOwn(original.judge.verification!, "workspaceMiB")).toBe(false);
    await declare("workspaceMiB: 2048,");
    expect((await loadBenchmark(root)).judge.verification?.workspaceMiB).toBe(2048);
    await declare("workspaceMiB: 4097,");
    await expect(loadBenchmark(root)).rejects.toThrow("workspaceMiB");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("verification transfer capacity defaults preserve identity and overrides remain explicit", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "openeval-input-capacity-"));
  try {
    await Bun.write(resolve(root, "evals/answer/prompt.md"), "Answer.");
    await Bun.write(resolve(root, "evals/answer/judge.md"), "## Criterion: answer — Answer\nPass when correct.");
    const declare = (extra: string) => Bun.write(resolve(root, "benchmark.ts"),
      `export default { models: ["example/model"], judge: { model: "example/judge", verification: { image: "fixture", ${extra} } } };`);
    await declare("");
    expect(Object.hasOwn((await loadBenchmark(root)).judge.verification!, "inputMiB")).toBe(false);
    await declare("inputMiB: 128,");
    expect(Object.hasOwn((await loadBenchmark(root)).judge.verification!, "inputMiB")).toBe(false);
    await declare("inputMiB: 256,");
    expect((await loadBenchmark(root)).judge.verification?.inputMiB).toBe(256);
    for (const value of ["0", "-1", "1.5", "NaN", "Infinity", "null", '"256"', "Number.MAX_SAFE_INTEGER"]) {
      await declare(`inputMiB: ${value},`);
      await expect(loadBenchmark(root)).rejects.toThrow("inputMiB");
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

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

test("a suite labels a benchmark without changing candidate or judge identity", async () => {
  const root = await mkdtemp(
    resolve(
      process.platform === "win32" ? "C:/tmp/opencode" : tmpdir(),
      "openeval-suite-",
    ),
  );
  try {
    const declare = (extra: string) =>
      Bun.write(
        resolve(root, "benchmark.ts"),
        `export default { name: "sql-bench", ${extra} models: ["example/model"], judge: { model: "example/judge" } };`,
      );
    await Bun.write(resolve(root, "evals/answer/prompt.md"), "Answer the question.");
    await Bun.write(
      resolve(root, "evals/answer/judge.md"),
      "## Criterion: correct — Correct answer\nPass when the answer is correct.",
    );
    await declare("");
    const plain = await loadBenchmark(root);
    await declare('suite: " Frontier ",');
    const labelled = await loadBenchmark(root);
    expect(labelled).toMatchObject({ name: "sql-bench", suite: "Frontier" });
    expect(plain.suite).toBeUndefined();
    expect(labelled.evals).toEqual(plain.evals);
    await declare('suite: "",');
    await expect(loadBenchmark(root)).rejects.toThrow("suite must be a label");
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

test("candidate time limits default to 45 minutes; an eval can set its own up to 12 hours", async () => {
  const root = await mkdtemp(
    resolve(
      process.platform === "win32" ? "C:/tmp/opencode" : tmpdir(),
      "openeval-time-limits-",
    ),
  );
  const write = (path: string, content: string) =>
    Bun.write(resolve(root, path), content);
  const benchmark = (candidate = "") =>
    write(
      "benchmark.ts",
      `export default { models: ["example/model"], judge: { model: "example/judge" }, ${candidate} };`,
    );
  try {
    await benchmark();
    for (const id of ["long", "short"]) {
      await write(`evals/${id}/prompt.md`, "Answer the question.");
      await write(
        `evals/${id}/judge.md`,
        "## Criterion: correct — Correct answer\nPass when the answer is correct.",
      );
    }
    await write(
      "evals/long/eval.ts",
      "export default { candidate: { timeoutMs: 12 * 60 * 60_000 } };",
    );
    const loaded = await loadBenchmark(root);
    expect(loaded.candidate.timeoutMs).toBe(CANDIDATE_TIMEOUT_MS);
    expect(candidateTimeout(loaded, "long")).toBe(MAX_CANDIDATE_TIMEOUT_MS);
    expect(candidateTimeout(loaded, "short")).toBe(CANDIDATE_TIMEOUT_MS);

    for (const [settings, error] of [
      ["{ timeoutMs: 12 * 60 * 60_000 + 1 }", "long: candidate timeout cannot exceed 12 hours"],
      ["{ timeoutMs: 1.5 }", "long: candidate timeout must be a positive integer"],
      ["{ maxCostUSD: 5 }", "long: candidate contains unsupported settings"],
    ]) {
      await write("evals/long/eval.ts", `export default { candidate: ${settings} };`);
      await expect(loadBenchmark(root)).rejects.toThrow(error);
    }

    await write("evals/long/eval.ts", "export default {};");
    await benchmark("candidate: { timeoutMs: 12 * 60 * 60_000 }");
    expect((await loadBenchmark(root)).candidate.timeoutMs).toBe(
      MAX_CANDIDATE_TIMEOUT_MS,
    );
    await benchmark("candidate: { timeoutMs: 12 * 60 * 60_000 + 1 }");
    await expect(loadBenchmark(root)).rejects.toThrow(
      "Candidate timeout cannot exceed 12 hours",
    );
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

test("cost limits and network allowlists are validated and kept only when declared", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "openeval-candidate-controls-"));
  try {
    await Bun.write(resolve(root, "evals/answer/prompt.md"), "Answer.");
    await Bun.write(resolve(root, "evals/answer/judge.md"), "## Criterion: answer — Answer\nPass when correct.");
    const declare = (candidate: string) => Bun.write(resolve(root, "benchmark.ts"),
      `export default { models: ["example/model"], judge: { model: "example/judge" }, candidate: { ${candidate} } };`);
    await declare("");
    const original = await loadBenchmark(root);
    expect(Object.hasOwn(original.candidate, "maxCostUSD")).toBe(false);
    expect(Object.hasOwn(original.candidate, "network")).toBe(false);
    await declare('maxCostUSD: 300, websearch: false, network: { allow: ["opencode.ai", "api.example.com", "opencode.ai"] }');
    const limited = await loadBenchmark(root);
    expect(limited.candidate.maxCostUSD).toBe(300);
    expect(limited.candidate.network).toEqual({ allow: ["api.example.com", "opencode.ai"] });
    for (const invalid of ["maxCostUSD: 0", "maxCostUSD: Infinity", 'websearch: false, network: { allow: [] }',
      'websearch: false, network: { allow: ["https://opencode.ai"] }', 'websearch: false, network: { allow: ["OpenCode.ai"] }',
      'network: { allow: ["opencode.ai"] }'])
    {
      await declare(invalid);
      await expect(loadBenchmark(root)).rejects.toThrow("candidate.");
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
