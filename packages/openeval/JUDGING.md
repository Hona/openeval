# Judging recorded work

Use the [canonical terminology](https://openev.al/docs/terminology/): a criterion
is a named graded requirement, a score is awarded credit, and a metric is a
measurement such as token count or cost. OpenEval supports code judges,
LLM judges, and additive use of both against one recorded EvalRun.

## File conventions

Every eval has prompt.md and at least one judge file:

| File | Role |
| --- | --- |
| judge.md | An LLM rubric with named criteria |
| judge.ts | An ordinary default-exported function receiving JudgeContext |
| Both | Both contribute distinct criterion scores; duplicate IDs are errors |

Only benchmarks containing judge.md need judge.model. Code judges run in a
separate Bun process on finalized evidence, under judge.timeoutMs (default ten
minutes). Code and hybrid evals use final grading; earlyStop is available to
Markdown-only evals. Candidate execution remains isolated from all judge code.

## Plain code judges

```ts
import type { JudgeContext } from "@hona/openeval";

export default ({ response }: JudgeContext) => ({
  scores: { correct_answer: response.text === "APPLE" },
  observed: response.text,
});
```

The function may be asynchronous and may return any JSON-compatible value.
Only the optional scores object has grading semantics. Each key is a criterion
ID, using lowercase letters, digits, and underscores, starting with a letter.
Values are booleans, finite numbers from 0 to 1, or null. The host converts true
to 1 and false to 0. It rejects invalid values rather than clamping them.
Optional `{ value, reason, evidence, measurements }` objects make code verdicts
readable without changing their scoring semantics. Declared code criterion IDs
must match the returned scores. See [artifact verification](VERIFICATION.md).
response.text is always a string; missing text becomes an empty string. The
original execution outcome is available separately on context.run.

Custom output is retained verbatim. An output without scores is unscored and
cannot silently disappear from the benchmark denominator. Use consistent score
IDs across models and repetitions; a missing required score stays unresolved.
There are no built-in task-specific scorers, registration steps, or builder APIs.

The host bundles local imports before execution, captures source maps, and
fingerprints the bundled code with the name and version of each imported
package. Code, imported references, or package version changes schedule
rejudging rather than candidate execution. The checkout location, working
directory, install layout, lockfiles, and SDK version do not. Use static imports
for reference data; make runtime network and file inputs reproducible when an
author-owned judge uses them.

The viewer shows normalized criterion scores, original returned JSON, frozen
source, process logs, and recorded candidate metrics. A synchronous loop can be
terminated by the host deadline. A code exception, invalid result, or timeout is
a JudgeRun error. A hybrid judgment is selected only after both sources succeed.

## JudgeContext and recorded data

| Primitive | Data |
| --- | --- |
| response / prompt | Final root answer and the exact task prompt |
| run | Recorded EvalRun and runtime inputs; null for constructed controls |
| metrics | Candidate-only usage, cost, tool reliability, compactions, and timing |
| recording.events(filter?) | Complete retained native events with their sequence and time |
| recording.tools(filter?) | Inputs, outputs, states, and timing of recorded invocations |
| recording.sessions() | All sessions in the candidate's isolated native archive |
| recording.messages(sessionID?) | Full paginated native history, including before compaction |
| recording.export(sessionID?) | Native OpenCode session export |
| workspace.files/read/text/diff | Verified initial and final file snapshots |
| workspace.materialize(revision?) | A disposable workspace copy for author-owned verification |
| verification.run(request) | Bounded commands over a restored artifact in an isolated OCI container |
| verification.read/text(result, path) | Hash-checked retained output from that verification |
| native.database() | Read-only SQLite access to a verified database copy |
| native.sdk() | The pinned OpenCode SDK/API over a separate disposable archive copy |
| native.schema() | The pinned OpenCode schema module |

Native readers initialize lazily and are disposed by the runner. SDK operations
and native schema upgrades affect only their disposable copy. The recorded
OpenCode version remains available separately from the reader version. Files and
database copies are checked against recorded hashes.
These APIs expose recorded data, not the user's live OpenCode service.

For independent inspection:

```ts
import { readRecording } from "@hona/openeval";

await using context = await readRecording("./results/RUN", "eval_ID");
console.log(context.metrics.tools.errorRate);
const history = await context.recording.messages();
const database = await context.native.database();
console.log(database.query("SELECT name FROM sqlite_master").all());
```

Metrics use deduplicated durable events across the candidate execution's
sessions. Usage includes recorded model requests and auxiliary usage such as
compaction. Cost is reported OpenCode usage, not an invoice or a promise of free
service. Missing usage is unavailable. Code that calls external services
directly can return its own accounting as metadata.

Tool error rate is failed / (succeeded + failed), with null when there are no
terminal calls. Unfinished calls are reported separately. A successful shell
tool reporting failed tests is not a native tool failure. Counts describe
recorded native invocations; do not infer uncaptured work inside a batched call.

Timing uses the union of closed recorded intervals. modelActiveMs includes
model-step and compaction spans, including time within those steps such as
retries. outputTokensPerSecond is reported output tokens per model-active second.
Token categories retain their native meanings; do not blindly add overlapping
reasoning, output, or cache categories into a new total.

## Shared judge agent

The Markdown judge uses the native OpenCode V2 primary agent `openeval-judge` for final
grading, live checks, rejudging, calibration, and independent audits. Its
[base system prompt](src/infra/judging/judge-agent.md) owns the common evidence,
citation, uncertainty, early-decision, and output rules. See
[OpenCode V2 custom agents](https://opencode.ai/v2/docs/agents/).

The native agent's system prompt contains the base instructions and one copy of
the eval rubric. It remains present across compaction. User turns identify the
phase; structured context and decisions move through registered Code Mode tools.
The tools use native Effect schemas for argument validation and catalog types.

An LLM JudgeRun records its shared profile in `input.agent`, explicit criteria,
mode, runtime hash, and protocol. The effective
native configuration is archived at `configuration/opencode.json` in its judge
directory. The profile contributes to the judge input fingerprint, so a shared
prompt change schedules rejudging using saved evidence. Candidate input
fingerprints do not include the judge profile.

## Eval rubrics

Declare one or more criteria in `judge.md`:

```md
# Advice quality

## Criterion: current_advice — Advice for the current situation
Pass when the requested advice is present and its recommendations are available now.
Fail when a recommendation is unavailable now, or the requested advice is omitted.

## Criterion: later_advice — Advice for later stages
Judge later recommendations at their explicitly stated stage.
```

Keep criterion-specific rules, accepted alternatives, and domain facts in that file.
The LLM applies these rules. The SDK validates the declared IDs, normalized criterion
values, recorded evidence references, and exact optional quotes. It calculates
the equal-weight mean of criterion scores. A missing criterion or invalid citation is a judge
protocol error; missing source evidence can produce a null criterion score. Every rubric
must declare at least one `## Criterion: id — Label`. A normalized Judgment has
an aggregate value and a scores map of CriterionScore objects containing value,
reason, evidence, and source. The original code output is retained separately.

## Criterion categories

A category is any non-empty string on a criterion. Categories group results in
the viewer and can compose a benchmark. They never change judge input,
fingerprints, or the headline weighting.

In `judge.md`, put one optional line directly below a criterion heading:

```md
## Criterion: asked_dialect — Asks for the SQL dialect
Categories: misalignment, general
```

OpenEval removes that line before hashing the rubric and before the judge reads
it, so adding or changing categories does not rejudge recorded evidence. A
`Categories:` line anywhere else is an error.

In `judge.ts`, export labels and categories for the scores it returns:

```ts
import type { CodeCriteria, JudgeContext } from "@hona/openeval";

export const criteria = {
  correct_answer: { name: "Correct answer", categories: ["general"] },
} satisfies CodeCriteria;

export default ({ response }: JudgeContext) => ({
  scores: { correct_answer: response.text.trim() === "42" },
});
```

Declare each criterion ID in one judge file only. Names are trimmed and matched
case-insensitively; the first spelling is displayed. A criterion may have
several categories, but one is usually clearer. A category score uses the same
rule as the overall score: criteria are averaged within each eval, then evals
are weighted equally. Unscored checks keep that category's score a range.

Compose a benchmark from categories in `benchmark.ts`. Evals without a matching
criterion are not run, and scores use only matching criteria:

```ts
export default {
  models: ["opencode/gpt-6-astra#high"],
  categories: ["coding", "verification"],
} satisfies Benchmark;
```

`openeval run --only-category <name>` limits one invocation to evals with a
matching criterion, like `--only-eval`, without changing the composition.

Prefer published category sets so results are comparable:

| Kind | Source | Categories |
| --- | --- | --- |
| Capability | [Artificial Analysis Intelligence Index](https://artificialanalysis.ai/methodology/intelligence-benchmarking) | `agents`, `coding`, `general`, `scientific-reasoning`; also `multilingual`, `vision` |
| Agent failure | [MAST](https://arxiv.org/abs/2503.13657) (Cemri et al., NeurIPS 2025) | `specification`, `misalignment`, `verification` |

## Structured tool submissions

| Tool | Data |
| --- | --- |
| `judge_context` | Current request ID, phase, criterion declarations, and evidence index |
| `candidate_evidence` | Recorded responses, tools, events, messages, artifacts, and metrics |
| `submit_judgment` | Scores keyed by criterion ID, with reasons and citations |
| `continue_judging` | An early check's reason for needing more evidence |

Native argument validation and citation validation return errors directly to the
judge. It can correct arguments or retrieve better evidence and retry within the
same native turn and existing timeout. The runner does not parse assistant text
for JSON or start synthetic format-repair turns. Ending without an accepted tool
submission fails the JudgeRun rather than assigning a candidate zero.

Tool schemas stay stable across checks. Each request ID is bound to one fixed
evidence view. Only the first valid submission is accepted; stale, concurrent, or
cancelled submissions cannot overwrite it or affect a later check. Early
submissions require every criterion score to be non-null and irreversible. Final grading
permits null criterion scores and rejects `continue_judging`.

Accepted submissions and semantic rejections are recorded in
`judgment-submissions.json`, with their request/check IDs and checkpoints. Native
schema failures are retained in the native tool transcript.

Every decided criterion score cites recorded evidence. Citations can name a response,
message ID, tool-call ID, event sequence, or initial/final artifact path. The
evidence reference/checkpoint binds those citations to the exact recording.
Source URLs are supplementary domain references, not substitutes for citations
to the candidate's work.

For example, the judge submits this from Code Mode after inspecting the recording:

```js
const context = await tools.judge_context({});
await tools.submit_judgment({
  requestId: context.requestId,
  scores: {
    current_advice: {
      value: 1,
      reason: "The current-stage recommendation satisfies the rubric.",
      evidence: [{ kind: "response" }],
    },
    later_advice: {
      value: 0,
      reason: "The later-stage recommendation violates the rubric.",
      evidence: [{ kind: "response" }],
    },
  },
});
```

The host stores the criterion-score map and aggregate value `0.5`. A citation's optional `quote` must occur
literally in the referenced response/tool/message/event/artifact. An artifact
citation must specify `path` and `revision` (`initial` or `final`); other record
citations specify `id`. Semantic interpretation remains the judge's job.

`recordEvidence` creates a calibration recording from supplied text/tool records
without executing a model or tool. `judgeEvidence` grades retained evidence into
a new standalone audit directory without changing a benchmark's active scores.
Use `judgeRuns` when an explicit rejudge should update active selections. For a
code-only control, pass code: "./path/to/judge.ts" to judgeEvidence; no judge model
is needed. Pass both rubric and code for additive grading.

Runtime uses recorded work intervals. Judge checks record `executionStartedAt`
when they obtain a worker, separately from their queue-admission `startedAt`.
`archiveStartedAt` records active finalization. A persistent judge's waiting time
is excluded. A check cancelled before worker admission has no runtime. Calendar
creation/completion dates remain provenance, not elapsed-runtime measurements.

## Design references

- [DeepSWE quality assurance](https://deepswe.datacurve.ai/blog/deepswe#qa):
  acceptance breadth and alignment between the specification and grading.
- [DeepSWE metrics](https://arxiv.org/html/2607.07946#S5.SS3): equal task weighting.
- [JudgeBench](https://arxiv.org/abs/2410.12784): validate factual and logical
  judging ability with known examples, rather than assuming model strength.

Keep task-specific decisions in the author-owned judge.md and judge.ts files.
The SDK handles recording, execution, validation, and equal-weight aggregation.
OpenEval 0.3.0 uses results schema 5 and the canonical API only.
