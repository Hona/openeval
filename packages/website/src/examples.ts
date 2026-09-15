export const VERSION = "0.3.2";
export const GITHUB = "https://github.com/Hona/openeval";
export const SITE = "https://openev.al";
export const prompt =
  "Write a SQL query for the ten most recent orders for a customer.";
export const rubric = `# Requests the SQL dialect

## Criterion: asked_dialect — Asks for the SQL dialect

Pass when the agent asks which database or SQL dialect is in use.
Fail when it assumes a dialect without asking.
Asking alongside a draft counts.

## Criterion: safe_parameters — Uses bound parameters

Pass when the proposed query uses a bound customer-ID parameter
and explains how to supply its value.
Fail when it interpolates customer input into SQL
or does not provide a parameterized query.`;
export const benchmark = `import type { Benchmark } from "@hona/openeval";

export default {
  models: ["provider/candidate-model"],
  candidate: { websearch: false },
  judge: { model: "provider/judge-model", websearch: false },
  repetitions: 1,
  concurrency: 1,
} satisfies Benchmark;`;
export const codePrompt = "Reply with exactly APPLE.";
export const codeJudge = `import type { JudgeContext } from "@hona/openeval";

export default ({ response }: JudgeContext) => ({
  scores: { correct_answer: response.text === "APPLE" },
});`;
export const codeBenchmark = `import type { Benchmark } from "@hona/openeval";

export default {
  models: ["provider/candidate-model"],
  repetitions: 3,
} satisfies Benchmark;`;
export const hybridCode = `import type { JudgeContext } from "@hona/openeval";

export default ({ response }: JudgeContext) => {
  try {
    const value = JSON.parse(response.text);
    return {
      scores: { json_shape: typeof value?.summary === "string" },
    };
  } catch {
    return { scores: { json_shape: false } };
  }
};`;
export const preparation = `import type { Eval } from "@hona/openeval";

export default {
  prepare: [
    { cwd: ".", argv: ["bun", "install", "--frozen-lockfile"] },
  ],
} satisfies Eval;`;
export const runCommands = `bunx --bun @hona/openeval image
bunx --bun @hona/openeval plan
bunx --bun @hona/openeval run
bunx --bun @hona/openeval view`;
export const query = `SELECT id, created_at, total
FROM orders
WHERE customer_id = $1
ORDER BY created_at DESC, id DESC
LIMIT 10;`;
export const starterFiles: Record<string, string> = {
  "package.json":
    JSON.stringify(
      {
        name: "my-benchmark",
        private: true,
        type: "module",
        scripts: {
          image: "openeval image",
          plan: "openeval plan",
          eval: "openeval run",
          view: "openeval view",
        },
        dependencies: { "@hona/openeval": VERSION },
      },
      null,
      2,
    ) + "\n",
  "benchmark.ts": benchmark + "\n",
  "evals/ask-dialect/prompt.md": prompt + "\n",
  "evals/ask-dialect/judge.md": rubric + "\n",
  ".gitignore": "node_modules/\nresults/\n",
  "README.md":
    "# My benchmark\n\n1. Check Bun 1.4.2+, a running Docker daemon with Linux containers, and OpenCode V2.\n2. Extract https://openev.al/eval-writing.zip here to install the project writing skill.\n3. In OpenCode, use /connect and /models. Replace both model placeholders in benchmark.ts; append a listed #variant if wanted.\n4. Run bun install, bun run image, then bun run plan. Check the single candidate and repetition.\n5. When ready, run bun run eval. To watch, run bun run view in a second terminal and open http://127.0.0.1:4173.\n6. Inspect the candidate session, criterion scores, and judgment. Evidence is retained in results/.\n\nDocumentation: https://openev.al/docs/quickstart/\nAgent documentation: https://openev.al/llms.txt\n",
};
