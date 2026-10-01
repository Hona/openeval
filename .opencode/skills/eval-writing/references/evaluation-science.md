# Evaluation design and controlled improvement

Reviewed 2026-10-01. This is a synthesis of the Claude eval-design article, its
linked workflow guides, and the statistical and long-task sources below. It is
not a replication of their results. Apply the method through the project's
existing framework; do not copy a vendor's runner, defaults, or storage format.

## Sample work, not a model's failure fingerprint

Start with the work a better agent would help the author finish. Source cases
from retained, privacy-safe production work, bug reports, and manual checks.
Author-written examples are useful seeds. Synthetic variations need real seeds,
an explanation of what makes the problem hard, and human review of the actual
inputs. Get approval for the case set and the scoring boundaries separately.
Neither approval authorizes paid collection.

Record why a case matters and why it is difficult **before** selecting it by a
model's score. A discovered failure is a useful regression case, not an estimate
of its production frequency. Include ordinary work and opposite contexts: when
to ask and when not to ask, when to preserve state and when a change is authorized.
Do not grow a suite solely by keeping the cases one current model fails.

Check the article's four signals:

| Signal | Evidence to seek | What it does not establish |
| --- | --- | --- |
| Representative work | Real inputs, interaction shape, tools, constraints | That a few salient failures represent all traffic |
| Sensible capability/effort response | A controlled comparison on matched inputs | A law that every stronger model or higher effort must win |
| Passable headroom | A verified solution through the allowed interface | That a universal failure is automatically a model limit |
| Stable measurement | Repeated outputs, fixed-output judge checks, environment receipts | That repeated agreement removes systematic judge error |

Near-ceiling capability cases can graduate to a cheap regression set. Uniform
failure calls for inspecting the task, success rule, opportunity, environment,
and judge before declaring a hard capability gap. Do not loosen a valid criterion
merely to obtain a preferred ranking. Keep benchmark versions and report which
population a score describes; moving cases between sets changes the score's meaning.

## Prefer observable delivery to activity

For an action task, the strongest answer is its resulting state: a working patch,
correct data, preserved user changes, or a completed workflow. A tool call, a
passing build, or a completion message alone does not prove that result. A narrow
process criterion can still be appropriate, but label it as process, not delivery.

Use a code judge when the decisive property is directly checkable. Use a calibrated
LLM judge for open-ended interpretation, not because its prose sounds convincing.
For taste, blind pairwise review against frozen reference artifacts can help:
randomize presentation order, permit ties and two bad outputs, and do not identify
the baseline or model. If the framework does not support that comparison, propose
an audit or a separately scoped capability; do not invent a private judging runtime.

Validate acceptance breadth with a reference solution, a valid alternative, a
near miss, and a trivial policy. An empty response must fail required delivery;
safe inaction can pass a preservation criterion without completing the task.
Normalize harmless representation differences only where the task permits them.
An explicit output-format constraint remains a real requirement.

Do not ban a code token as a substitute for behavior. Reading a scroll offset
can be valid; visible viewport stability is a different property. A variable name
in an example, object property, or other language is not an executed forbidden
binding. Require the observation that actually supports the intended claim.

## Longer tasks need dependencies, not padding

Design one coherent deliverable with dependent decisions: discover the cause,
repair it, recover from a plausible obstacle, verify the result, and hand back
usable work. Prior discoveries must matter to later decisions. A large prompt,
forced sleep, repeated expensive command, or batch of independent trivia does not
create a meaningful long horizon.

Record human completion time separately from candidate wall-clock and tool time.
Label unmeasured human durations as estimates. METR's time horizon is a success
level over **human-duration-calibrated tasks**, not time the agent stayed running.
Do not claim that metric from a small collection without its baseline and analysis.

Check the allowed interface, state reset, context handling, and feedback regime.
If no user reply is supplied, a task cannot require work that depends on that reply.
GUI, game, process-liveness, or timed-event claims need retained state/action
evidence; a screenshot or candidate-written score file is not enough. Resolve an
evidence gap before calling the design runnable. Respect the framework's time cap.

When changing an event criterion into a final-outcome criterion, inspect early
stopping. Work stopped after the old event may never have had a chance to complete
the new deliverable. Rejudging that prefix does not restore the lost opportunity.

## Separate the sources of uncertainty

| Source | Suitable diagnostic |
| --- | --- |
| Candidate sampling | Repeat the same task under unchanged conditions |
| Judge sampling | Judge an identical retained output again, under approved scope |
| Task selection | Diverse independently sourced tasks; task/family-level analysis |
| Generated environment or artifact | Rebuild with no change before comparing variants |
| Environment/serving drift | No-change controls and actual version, resource, tool, and provider records |

Keep the response, tool results, artifacts, judgment, timings, and usage from the
same execution. Verify requested settings actually reach the candidate and any
delegated work. A displayed model ID can show an echo rather than prove serving
identity; report what the provider exposes and any remaining uncertainty.

Classify failures before interpreting scores. A naturally completed empty answer,
an explicit refusal, an unresolved interruption, a missing tool, and a JudgeRun
error are different observations. Apply the project's declared scoring policy;
do not blindly exclude every timeout or give every failure zero. Report coverage
and causes alongside quality, with all attempts retained.

Report candidate cost, judge cost, and total measured spend separately where
available. Distinguish agent wall-clock, model-active time, tool time, queueing,
and retries. Inspect cache state and pricing basis before attributing cost changes.
Unknown cost is not zero cost. A cheaper incomplete task is not a successful saving.

## Compare matched tasks; repetitions are not more task types

Before collecting data, state the smallest change that would affect a decision,
the target score, any cost/latency constraints, and the retry/exclusion policy.
Use existing observations or an authorized pilot to assess whether the design
can resolve that change. Do not promise precision from a generic sample-size rule.

For two systems, compare their scores on the same tasks. Preserve the framework's
weights and dependencies among criteria. Analyze paired task-level differences;
account for related tasks, shared fixtures, and repeated samples. Do not treat
every criterion or repetition as an independent task. Preserve correlations when
resampling, and state whether an interval concerns the fixed task set or a wider
population. A few curated families support limited claims even with many repeats.

The guides' `1/sqrt(cases × repeats)` is only an approximate independent-binary
planning shortcut. Task/family variation is not removed by repeating the same
cases. More repetitions reduce sampling noise; more diverse cases improve task
coverage. Neither removes biased ground truth or a consistently mistaken judge.
Three successes in three attempts do not establish perfect reliability.

Use an interval or test appropriate to the paired **difference**, not whether two
separate score intervals overlap. Overlap can coexist with a detectable paired
difference. Distinguish statistical detectability from a useful effect size.
For a tiny, saturated, clustered, or partly unscored set, show the outcomes and
limitations rather than manufacture a precise confidence interval. Missing-score
completion bounds are not sampling-confidence intervals.

## Controlled optimization is a separate, approved task

Do not start a hillclimb because the user asked for an eval review. When optimization
is requested, agree on the objective, editable surface, off-limits files, collection
scope, and budget first. Freeze the task set and judge for the comparison. Keep
evaluator answers structurally outside the candidate's reach, including reachable
history and answer-hosting sources; preserve legitimate task research.

Use these safeguards:

1. Split by independent task or source family, not by repetitions or baseline
   failures. Keep close variants together. The proposer sees development examples
   only; any content already inspected is no longer a pristine holdout.
2. Call the set used to choose rounds **validation/selection**, even if a guide
   calls it test. Repeated keep/revert decisions use its information. Reserve a
   fresh final test or confirmation before making a generalization claim. Do not
   redraw a split to obtain favorable baseline balance.
3. Make one falsifiable hypothesis per change. Predict the behavior that should
   move, what would disprove the hypothesis, and which useful behavior might regress.
   Fix a mechanism rather than paste case answers or nouns into instructions.
4. Keep the judge, tasks, serving conditions, and non-target surfaces fixed. If a
   measurement defect is repaired, preserve old judgments and consistently rescore
   comparable retained outputs. A changed candidate task needs new execution;
   distinguish instrument repair from improvement of the agent.
5. Compare against a no-change control when conditions drift. Adoption needs the
   registered quality and cost/latency conditions, not a lucky favorable draw.
   Judge upgrades and large unexplained gains need human spot-checks.
6. On a plateau, classify failures as a capability/instruction gap, task ambiguity,
   judge error, environment/harness fault, or variance. Do not keep adding prompt
   instructions to an unrelated bottleneck.

For a near-saturated suite, cost or latency at a stated quality floor can be a
better objective than squeezing the last quality point. Verify redundant actions
actually occur before removing instructions. Preserve user context, safety,
tool contracts, and fragile operational procedures; shorter text is not itself
better. More thinking, fewer tool calls, and a newer model are hypotheses to test,
not automatic improvements.

## Sources and limits

- [Automating eval design and hillclimbing with Claude](https://claude.dev/blog/automating-eval-design-and-hillclimbing/),
  Lance Martin, 2026-09-28. Practical guidance and vendor-reported examples, not
  a controlled validation of this benchmark.
- Linked `claude-api` skill reviewed at
  [8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4](https://github.com/anthropics/skills/tree/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/claude-api):
  [build-eval](https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/claude-api/shared/evals/build-eval.md),
  [eval-audit](https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/claude-api/shared/evals/eval-audit.md),
  [eval-hillclimb](https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/claude-api/shared/evals/eval-hillclimb.md),
  [cost-hillclimb](https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/claude-api/shared/evals/cost-hillclimb.md),
  the report schema and runner/report source, prompt-audit, and agent-design.
  Vendor-specific defaults, file layouts, automatic exclusions, numerical gates,
  and informal monotonicity assumptions are not universal policy. The lite report
  source calculates means but no confidence intervals; guidance to report an
  interval is not evidence that a renderer computed one.
- [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents),
  2026-01-09. Outcomes, acceptance breadth, paired behavior contexts, transcript
  review, and capability-to-regression graduation.
- [Reducing cost and improving performance](https://claude.com/blog/reducing-cost-and-improving-performance-with-claude-platform),
  2026-09-08, updated for September models. Useful cost hypotheses; measured
  examples do not transfer automatically to other models, providers, or tasks.
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents),
  2025-11-26. State continuity and end-to-end verification; one harness design,
  not a mandate for an initializer, JSON checklist, commit ritual, or multi-agent system.
- [Adding Error Bars to Evals](https://arxiv.org/html/2411.00640v1),
  Evan Miller, 2024-11-01, §§2–5. Paired comparisons, clusters, variance components,
  and power; large-sample formulas need justified assumptions.
- [Measuring all the noises of LLM Evals](https://arxiv.org/html/2512.21326v2),
  Sida I. Wang, 2026-03-29, §§2–3, 6 and appendices. Prediction versus task-selection
  noise and paired analysis; empirical claims concern correctness benchmarks and
  do not establish the noise of a small heterogeneous agent suite.
- [METR time-horizon methodology](https://metr.org/time-horizons/), living page
  reviewed 2026-10-01. Human-duration calibration and coherent dependent tasks;
  neither candidate runtime nor a few long tasks supports a comparable METR horizon.
