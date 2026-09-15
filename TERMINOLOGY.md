# OpenEval terminology

This is OpenEval's canonical vocabulary for documentation, interfaces, code, and
the viewer. A metric measures what happened. A criterion defines what earns
credit. A score is the credit awarded.

> A benchmark contains evals. Each eval defines a task and a rubric. Judges
> produce scores for the rubric's criteria. Runs also record metrics such as
> cost, tokens, and tool reliability.

## Definitions

| Term | Meaning | Example |
| --- | --- | --- |
| Benchmark | A collection of evals and their run configuration. | A set of agent tasks evaluated across models. |
| Eval | A task, its input and environment, and its grading specification. | Produce a parameterized SQL query. |
| Criterion | A named requirement being graded. Plural: criteria. | safe_parameters |
| Score | Credit awarded to a criterion, normalized from 0 to 1, or an aggregate of that credit. | 1 for full credit; 0 for no credit. |
| Metric | An observed or calculated measurement. It contributes to grading only when a criterion uses it. | Cost in USD, token count, or tool error rate. |
| Rubric | The criteria and rules for awarding scores. | The conditions for accepting a parameterized query. |
| Judge | An evaluator that applies grading rules using code, an LLM, or both. | An LLM applying a written rubric. |
| Judgment | A judge's output, including any named criterion scores and supporting data. | A safe_parameters score with evidence. |
| BenchmarkRun | A recorded benchmark collection with its inputs and selected results. | One retained comparison across models. |
| EvalRun | One candidate execution of an eval. | A model's second repetition of the SQL task. |
| JudgeRun | A grading execution against recorded evidence. | A new judgment of a retained EvalRun. |

## Measurements and credit

The unit and meaning distinguish a metric from a score. A tool error rate of
0.2 is a metric even though it falls between 0 and 1. A criterion can use that
measurement to award credit under an author-defined rule.

For example, cost_usd = 0.84 is a metric. within_budget is a criterion whose rule
might award 1 when cost_usd is at most 1.00. The resulting within_budget value
is a criterion score. Recording cost alone does not award or deduct credit.

Criterion IDs are chosen by the author. A name such as correct_answer does not
have a built-in grading rule. In the planned code-judging contract, entries in
scores are criterion scores; other returned data can be descriptive metadata.
An output without scores is unscored. Missing required scores must not silently
change the benchmark denominator.

The current aggregation is: average repetitions per criterion, average criteria
within each eval, then average evals equally and multiply by 100. Required
unresolved scores leave the final percentage unresolved. Category-specific
views and unequal weights are future design work.

## Recordings, traces, and evidence

- A recording is the retained execution data: messages, events, native session
  archives, and workspace artifacts, subject to recorded capture coverage.
- A trace is an ordered view of recorded model and tool activity.
- Evidence is the recorded material used to support a judgment. A citation
  identifies the relevant part of that material.

Keep definition names distinct from execution names. An Eval is a reusable task;
an EvalRun is one execution. Use BenchmarkRun, EvalRun, and JudgeRun for stored
execution records.

## Naming rules

- Use criterion and criteria for graded requirements, IDs, decisions, and score
  breakdowns. Use metric and metrics for measurements.
- Use judge for both code-based and model-based evaluators. Say LLM judge when
  the model-based implementation matters. The planned injected context is
  JudgeContext; do not introduce a parallel ScorerContext or ScorerRun concept.
- Use rubric for the grading specification and judgment for its application to
  recorded work. prompt.md contains the task, not its grading specification.
- Use criterion score, eval score, and benchmark score when the aggregation
  level matters. A partial-credit percentage is not automatically a task-success
  rate or a general measure of intelligence.
- Preserve literal compatibility identifiers, historical quotations, and titles
  of external sources. Explain their meaning using this vocabulary.

## Release compatibility

The published SDK is 0.2.2. Its runnable examples use the legacy spelling
`## Metric: id — Label` to declare a criterion in judge.md. Its API and stored
records also use names such as `MetricDefinition`, `MetricJudgment`,
`rubricMetrics`, and `judgment.metrics`. These are compatibility identifiers for
criteria and criterion scores, not names for usage measurements.

Canonical authoring uses `## Criterion: id — Label`. Support for that spelling,
JudgeContext, and additive judge.md / judge.ts execution belongs to the planned
0.3.0 release. They are not available from 0.2.2. Current per-criterion values
are 0, 1, or null; boolean normalization and fractional criterion scores are also
part of that planned release. null is unresolved, not zero or partial credit.

Document released capabilities as released capabilities. Label unreleased API
examples and use the installed version's literal names when writing runnable
examples. Keep historical recordings and finalized judgments immutable during
terminology migrations.
