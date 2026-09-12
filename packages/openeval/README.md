<div align="center">
  <h1>OpenEval</h1>
  <p><strong>Give your agent a task. Judge the evidence.</strong></p>
  <p>A typed prompt-plus-LLM-judge SDK. Isolated agents, recorded work, and scores you can inspect.</p>
  <p>
    <a href="https://www.npmjs.com/package/@hona/openeval"><img src="https://img.shields.io/npm/v/%40hona%2Fopeneval?style=flat-square&color=66d38a" alt="npm version"></a>
    <a href="https://bun.com"><img src="https://img.shields.io/badge/Bun-1.4.2%2B-f9f1e1?style=flat-square" alt="Bun 1.4.2 or later"></a>
    <a href="https://github.com/Hona/openeval/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-66d38a?style=flat-square" alt="MIT license"></a>
  </p>
</div>

![OpenEval results dashboard with model scores, scored checks, runtime, and cost](https://raw.githubusercontent.com/Hona/openeval/main/docs/images/results.png)

*Screenshots show the real viewer with illustrative demo data and fictional model
labels. They are not benchmark measurements.*

## Write your first eval

Start with a task in `prompt.md` and the behavior you want to measure in `judge.md`.
OpenEval discovers eval folders automatically.

```text
my-benchmark/
  benchmark.ts
  evals/
    ask-dialect/
      prompt.md
      judge.md
```

**`evals/ask-dialect/prompt.md`** — the task, sent verbatim:

```md
Write a SQL query for the ten most recent orders for a customer.
```

**`evals/ask-dialect/judge.md`** — the criteria for grading the recorded answer:

```md
# Requests the SQL dialect

## Metric: asked_dialect — Asks which SQL dialect to use

Pass when the agent asks which database or SQL dialect is in use.
Fail when it assumes a dialect without asking. Asking alongside a draft counts.

## Metric: safe_parameters — Uses bound parameters

Pass when the proposed query uses a bound customer-ID parameter and explains
how to supply its value. Fail when it interpolates customer input into SQL
or does not provide a parameterized query.
```

One recording can answer both questions: **did the agent ask for the dialect?**
And **did it use bound parameters?** Each metric is `0`, `1`, or `null` when
evidence is insufficient. The judge supplies citations to the recording. A shared native
judge agent supplies the evidence and submission protocol; rubrics contain the
task-specific criteria. See [JUDGING.md](JUDGING.md).

## Choose models and run

Requires Bun 1.4.2 or later, Docker, and an authenticated OpenCode installation.
The agent runtime currently uses OpenCode `0.0.0-beta-19296`.

Install the SDK inside `my-benchmark`:

```sh
bun add --exact @hona/openeval
```

Add **`benchmark.ts`**, replacing the model references with models connected in
OpenCode:

```ts
import type { Benchmark } from "@hona/openeval";

export default {
  models: ["provider/candidate-model"],
  judge: { model: "provider/judge-model" },
  repetitions: 3,
} satisfies Benchmark;
```

From your benchmark directory:

```sh
bunx --bun @hona/openeval image
bunx --bun @hona/openeval plan
bunx --bun @hona/openeval run
bunx --bun @hona/openeval view
```

The viewer opens at `http://127.0.0.1:4173`. Use `--benchmark <directory>` to point
any command at another benchmark, or `--port <port>` for another viewer port.

## Inspect the evidence

Select an eval to see its individual metrics. Open a run to read the candidate's
session and the judge's reasoning, then follow citations back to the evidence.

![SQL eval drilldown with a judge decision, separate metric scores, and evidence links](https://raw.githubusercontent.com/Hona/openeval/main/docs/images/judgment.png)

The live queue separates candidate work from judging, with worker utilization,
progress, costs, and an estimated finish time.

![Live eval queue showing queued, in-progress, completed, and needs-attention stages](https://raw.githubusercontent.com/Hona/openeval/main/docs/images/queue.png)

## Scoring and incremental runs

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
CLI, viewer, and development inputs. See [RELEASING.md](https://github.com/Hona/openeval/blob/main/RELEASING.md).

OpenEval is MIT licensed. The vendored session UI retains its upstream MIT
license and revision in `vendor/session-ui`. Built viewer distributions include
third-party license notices.
