# OpenEval

A typed prompt-plus-LLM-judge SDK for Bun. Run agents in isolated containers,
record their work, grade the evidence, and explore the results in a local viewer.

## Install

Requires Bun 1.4.2 or later, Docker, and an authenticated OpenCode installation.
The agent runtime currently uses OpenCode `0.0.0-beta-19296`.

```sh
bun add --exact @hona/openeval
```

## Declare a benchmark

```text
my-benchmark/
  benchmark.ts
  evals/
    ask-dialect/
      prompt.md
      judge.md
```

`benchmark.ts`:

```ts
import type { Benchmark } from "@hona/openeval";

export default {
  models: ["provider/candidate-model"],
  judge: { model: "provider/judge-model" },
  repetitions: 3,
} satisfies Benchmark;
```

Replace the model references with models connected in OpenCode.

`evals/ask-dialect/prompt.md`:

```md
Write a SQL query for the ten most recent orders for a customer.
```

`evals/ask-dialect/judge.md`:

```md
# Requests the SQL dialect

## Metric: asked_dialect — Asks which SQL dialect to use

Pass when the agent asks which database or SQL dialect is in use.
Fail when it assumes a dialect without asking. Asking alongside a draft counts.
```

Prompts are sent verbatim. Each metric is `0`, `1`, or `null` when evidence is
insufficient. The judge supplies citations to the recording. A shared native
judge agent supplies the evidence and submission protocol; rubrics contain the
task-specific criteria. See [JUDGING.md](packages/openeval/JUDGING.md).

## Run and inspect

From your benchmark directory:

```sh
bunx --bun @hona/openeval image
bunx --bun @hona/openeval plan
bunx --bun @hona/openeval run
bunx --bun @hona/openeval view
```

The viewer opens at `http://127.0.0.1:4173`. Use `--benchmark <directory>` to point
any command at another benchmark, or `--port <port>` for another viewer port.

`run` resumes the current aggregate and reuses unchanged work. `--new` starts a
separate result. Repeat `--only-eval`, `--only-model`, or `--only-repetition` to
execute a small scope while retaining the full aggregate. `--max-cost <usd>`
sets a scheduling budget for the invocation. Run `openeval --help` for commands.

Scores average repetitions per metric, metrics per eval, then evals equally.
Unresolved checks produce completion bounds until the final percentage is known.
The viewer provides metric drilldowns and recorded candidate and judge sessions.
Elapsed time measures active execution intervals, counting overlapping work once.

## Prepare a workspace

An eval's optional `workspace/` directory supplies files. An optional `eval.ts`
can declare a pinned Git repository or readable revision overlays and preparation
commands:

```ts
import type { Eval } from "@hona/openeval";

export default {
  prepare: [{ cwd: ".", argv: ["bun", "install", "--frozen-lockfile"] }],
} satisfies Eval;
```

Preparation runs before recording the initial candidate workspace. Candidate
containers receive project inputs, never judge rubrics or evaluator storage.
Candidates finish naturally, meet an opted-in irreversible judge decision, or
time out after at most 45 minutes. Finalized recordings remain immutable.

## SDK

```ts
import { runBenchmark, serveResults } from "@hona/openeval";

await runBenchmark("./my-benchmark");
```

The package also exports types, result readers, snapshot and rejudge functions,
and reusable view/session data through `@hona/openeval/types`, `/results`,
`/view`, and `/session`.

## Develop and release

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
bun run release:pack
bun run release:verify
```

The private benchmark client is maintained in a separate repository. It installs
an exact published SDK version. This repository contains only the reusable SDK,
CLI, viewer, and development inputs. See [RELEASING.md](RELEASING.md).

OpenEval is MIT licensed. The vendored session UI retains its upstream MIT
license and revision in `vendor/session-ui`. Built viewer distributions include
third-party license notices.
