# Apply the workflow with OpenEval

This reference describes the public `@hona/openeval` 0.3.0 contracts, reviewed
2026-09-15. Check the installed version's documentation before using its APIs.
Follow the benchmark author's own repository rules, inventory, and collection
policy. Repository-specific commands and approvals are not universal SDK features.

Use the [canonical vocabulary](https://openev.al/docs/terminology/): criteria are
graded requirements, scores are awarded credit, and metrics are measurements.
Use `## Criterion:` headings, CriterionDefinition, CriterionScore, and
JudgeContext. Criterion scores are stored in judgment.scores; usage measurements
are metrics. The API and results schema 5 use the canonical names directly.

## Files and responsibilities

```text
my-benchmark/
  benchmark.ts
  evals/
    task-id/
      prompt.md
      judge.md
      judge.ts       # code, Markdown, or both judge files
      eval.ts        # optional workspace preparation / early stopping
      workspace/     # optional candidate-visible starting files
```

- `prompt.md` is sent verbatim. Include the task and genuine constraints.
- `judge.md` defines task-specific criteria, accepted alternatives, and domain facts.
- `judge.ts` default-exports a function receiving JudgeContext and returning JSON.
  Its optional scores map contains booleans, finite numbers from 0 to 1, or null.
  Both files contribute distinct criteria; duplicate IDs are errors. Code-only
  benchmarks do not require a judge model. Code and hybrid evals use final grading.
- `eval.ts` uses the public `Eval` declaration for preparation and early stopping.
- `benchmark.ts` declares models, repetitions, the judge, and execution settings
  through the public `Benchmark` type.

Use the published SDK and CLI. Keep benchmark content in its client project.
The candidate environment must not contain rubric files, calibration controls,
answer keys, evaluator code, or evidence storage. Preparation is not candidate work.

## Rubric format

Every Markdown rubric declares one or more criteria with stable, unique IDs:

```md
# Incident summary

## Criterion: supported_summary — Complete, source-supported summary

Pass when the response identifies the incident, impact, and resolution described
in the supplied report, and makes no material claim that contradicts that report.
Fail when requested information present in the report is omitted, or a material
claim is contradicted. An empty answer does not pass.
Accept equivalent wording, organization, and a concise summary. If the report
does not provide a requested fact, explicitly identifying that gap is acceptable.
Do not score prose style beyond whether the requested information is intelligible.
```

This is an illustrative rubric, not a complete runnable benchmark. Its task and
source report would need to support the stated requirements.

The native `openeval-judge` agent owns common evidence access, citation, output,
correction, and unknown-result instructions. Keep shared judging mechanics in
the SDK and task-specific criterion rules in the rubric.

Each declared criterion receives normalized credit from 0 to 1, or null:

| Value / state | Meaning |
| --- | --- |
| `1` | The evidence establishes the criterion's pass conditions |
| `0` | The evidence establishes failure, including required omissions at natural completion |
| A fraction | Partial credit under an explicit author-defined rule |
| `null` | Necessary evidence or a decisive reference fact cannot resolve the criterion |
| JudgeRun error | Submission or judging failed; this is not a candidate zero |

A completed judgment contains the full criterion-score map in `scores`.
The SDK normalizes booleans and validates IDs,
values, recorded citations, and exact optional quotes; the judge interprets the
criteria. Source URLs support domain facts but do not replace evidence of what
the candidate actually did. A valid citation does not certify the interpretation.

## Evidence and calibration

The Markdown judge is an observer. It can inspect recorded messages, tool results, events,
and initial/final artifacts; it cannot execute candidate commands or change the
candidate's files to prove a missing result.

Code judges have typed recording, tool, event, file, and measurement primitives.
Native SDK/API, schema, and read-only SQL readers initialize lazily over verified
archive copies. A disposable workspace can support author-owned verification;
attribute new checks to the judge rather than claiming the candidate ran them.
Keep task-specific rules in the benchmark's function. The SDK provides data and
execution primitives, not built-in task-specific scorers or registration DSLs.

Useful public exports:

| Export | Purpose |
| --- | --- |
| `loadBenchmark` | Load and validate a benchmark declaration and its eval files |
| `rubricCriteria` | Read criterion declarations from rubric text |
| `recordEvidence` | Create a recording from supplied text and tool records |
| `judgeEvidence` | Judge evidence into a new standalone directory without selecting benchmark scores |
| `judgeRuns` | Rejudge retained executions and update their active judgment selections |
| `readRecording` | Open typed recorded data and lazy native readers; dispose after use |

`recordEvidence` does not run supplied tools. Constructed controls test semantic
boundaries, not real execution or environment feasibility. Keep their provenance
clear. Match expected labels to all declared criteria and review disagreements.
Use `judgeEvidence` for authorized calibration and independent audits. Pass a
code path for deterministic grading, rubric text and a judge model for LLM grading,
or both for hybrid grading. Code-only controls need no model calls unless their
author's function explicitly makes one. LLM grading requires an authorized scope.

For a simple non-model declaration check in the benchmark project:

```ts
import { loadBenchmark } from "@hona/openeval";

await loadBenchmark("./my-benchmark");
```

Run the project's typecheck and relevant local checks as well. A declaration
loading successfully is not proof that its environment works or its judge is calibrated.

## Plan a small collection

Install an exact released dependency with the project's package manager. For Bun:

```sh
bun add --exact @hona/openeval
```

Replace the placeholders before planning. These commands run from the directory
containing `my-benchmark/`:

```sh
bunx --bun @hona/openeval plan --benchmark ./my-benchmark --only-eval EVAL_ID --only-model PROVIDER/MODEL --only-repetition 1
```

`plan` reports work without executing candidates or judges. Once collection is
authorized, use `run` with the same scope. `--max-cost` is a scheduling budget,
not a guaranteed billing ceiling; active work can finish above the estimate.
`--final-only` disables live judge monitoring for that invocation.

## Stopping, revision, and aggregation

- Candidates normally finish naturally, with a maximum of 45 minutes. Early
  stopping is opt-in and host-controlled. Every criterion score must be non-null and
  irreversible before an early decision can stop execution.
- Missing work so far usually calls for continuing. A completed qualifying event
  can establish an irreversible pass; a final-state property may still change.
- Timeout or interruption alone is not a failed criterion. Grade what the archive
  establishes. If more execution could have changed an unresolved decision,
  use `null` under the shared contract.
- Finalized EvalRuns, JudgeRuns, and evidence remain immutable. New completed
  rejudgments update selections, retaining the originals. Snapshot selections
  before an authorized scoring revision.
- Rubric-only changes can reuse recorded work. Changed task/workspace inputs
  require new candidate evidence. An old early stop may leave too little evidence
  for a revised rubric; use the planner's affected-work decisions.
- `run` resumes the current BenchmarkRun and preserves unchanged work. Use `--new`
  only when a separate result is intended, not as a shortcut for rubric maintenance.
- Average repetitions per criterion, then criteria per eval, then evals equally;
  multiply by 100. Eval scores of 50% and 100% produce 75% overall, even if the
  first eval contains more criteria. Extra criteria change its internal weighting.
- Required unknowns keep the final score unresolved. Completion ranges bound
  possible scores; they are not confidence intervals. The main result is one
  percentage per model, with criterion scores in the selected eval's drilldown.

## Public references

- [OpenEval README](https://github.com/Hona/openeval#readme)
- [0.3.0 judging contract](https://github.com/Hona/openeval/blob/v0.3.0/packages/openeval/JUDGING.md)
- [Task prompts](https://openev.al/docs/prompts/)
- [Judge rubrics](https://openev.al/docs/rubrics/)
- [Workspace preparation](https://openev.al/docs/workspaces/)
- [Evidence and rejudging](https://openev.al/docs/evidence/)
