export const VERSION = "0.2.0";
export const GITHUB = "https://github.com/Hona/openeval";
export const SITE = "https://openev.al";
export const install = "bun add --exact @hona/openeval";
export const prompt =
  "Write a SQL query for the ten most recent orders for a customer.";
export const rubric = `# Requests the SQL dialect

## Metric: asked_dialect — Asks for the SQL dialect

Pass when the agent asks which database or SQL dialect is in use.
Fail when it assumes a dialect without asking.
Asking alongside a draft counts.

## Metric: safe_parameters — Uses bound parameters

Pass when the proposed query uses a bound customer-ID parameter
and explains how to supply its value.
Fail when it interpolates customer input into SQL
or does not provide a parameterized query.`;
export const benchmark = `import type { Benchmark } from "@hona/openeval";

export default {
  models: ["provider/candidate-model"],
  judge: { model: "provider/judge-model" },
  repetitions: 3,
  concurrency: 10,
} satisfies Benchmark;`;
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
    "# My benchmark\n\n1. Install Bun 1.4.2+, start Docker, and connect your models in OpenCode.\n2. Replace the two provider/model placeholders in benchmark.ts.\n3. Run bun install, bun run image, bun run plan, bun run eval, and bun run view.\n\nDocumentation: https://openev.al/docs/quickstart/\n",
};
