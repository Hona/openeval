# Judging recorded work

## Shared judge agent

OpenEval uses the native OpenCode V2 primary agent `openeval-judge` for final
grading, live checks, rejudging, calibration, and independent audits. Its
[base system prompt](src/infra/judging/judge-agent.md) owns the common evidence,
citation, uncertainty, early-decision, and output rules. See
[OpenCode V2 custom agents](https://opencode.ai/v2/docs/agents/).

The native agent's system prompt contains the base instructions and one copy of
the eval rubric. It remains present across compaction. User turns identify the
phase; structured context and decisions move through registered Code Mode tools.
The tools use native Effect schemas for argument validation and catalog types.

Every JudgeRun requires its shared profile in `input.agent`, explicit metrics,
mode, runtime hash, and protocol. The effective
native configuration is archived at `configuration/opencode.json` in its judge
directory. The profile contributes to the judge input fingerprint, so a shared
prompt change schedules rejudging using saved evidence. Candidate input
fingerprints do not include the judge profile.

## Eval metric rubrics

Declare one or more metrics in `judge.md`:

```md
# Advice quality

## Metric: current_advice — Advice for the current situation
Pass when the requested advice is present and its recommendations are available now.
Fail when a recommendation is unavailable now, or the requested advice is omitted.

## Metric: later_advice — Advice for later stages
Judge later recommendations at their explicitly stated stage.
```

Keep metric-specific rules, accepted alternatives, and domain facts in that file.
The LLM applies these rules. The SDK validates the declared IDs, binary metric
values, recorded evidence references, and exact optional quotes. It calculates
the equal-weight metric mean. A missing metric or invalid citation is a judge
protocol error; missing source evidence can produce a null metric. Every rubric
must declare at least one `## Metric: id — Label`, and every judgment contains
the complete metric array.

## Structured tool submissions

| Tool | Data |
| --- | --- |
| `judge_context` | Current request ID, phase, metric declarations, and evidence index |
| `candidate_evidence` | Recorded responses, tools, events, messages, and artifacts |
| `submit_judgment` | Scores keyed by metric ID, with reasons and citations |
| `continue_judging` | An early check's reason for needing more evidence |

Native argument validation and citation validation return errors directly to the
judge. It can correct arguments or retrieve better evidence and retry within the
same native turn and existing timeout. The runner does not parse assistant text
for JSON or start synthetic format-repair turns. Ending without an accepted tool
submission fails the JudgeRun rather than assigning a candidate zero.

Tool schemas stay stable across checks. Each request ID is bound to one fixed
evidence view. Only the first valid submission is accepted; stale, concurrent, or
cancelled submissions cannot overwrite it or affect a later check. Early
submissions require every metric to be non-null and irreversible. Final grading
permits null metrics and rejects `continue_judging`.

Accepted submissions and semantic rejections are recorded in
`judgment-submissions.json`, with their request/check IDs and checkpoints. Native
schema failures are retained in the native tool transcript.

Every decided metric cites recorded evidence. Citations can name a response,
message ID, tool-call ID, event sequence, or initial/final artifact path. The
evidence reference/checkpoint binds those citations to the exact recording.
Source URLs are supplementary domain references, not substitutes for citations
to the candidate's work.

For example, the judge submits this from Code Mode after inspecting the recording:

```js
const context = await tools.judge_context({});
await tools.submit_judgment({
  requestId: context.requestId,
  metrics: {
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

The host stores the metric array and aggregate value `0.5`. A citation's optional `quote` must occur
literally in the referenced response/tool/message/event/artifact. An artifact
citation must specify `path` and `revision` (`initial` or `final`); other record
citations specify `id`. Semantic interpretation remains the judge's job.

`recordEvidence` creates a calibration recording from supplied text/tool records
without executing a model or tool. `judgeEvidence` grades retained evidence into
a new standalone audit directory without changing a benchmark's active scores.
Use `judgeRuns` when an explicit rejudge should update active selections.

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

Keep task-specific decisions in `judge.md`; executable SDK code handles the
recording protocol and generic arithmetic, not task success rules.
