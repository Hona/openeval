# Coaching examples

These are fictional design exercises, not a benchmark inventory or collected
results. Use the smallest example that resolves the author's uncertainty.

## 1. A tool choice is not necessarily the outcome

**Proposed rule:** “Pass only if the agent uses Python to produce the weekly
sales summary.”

**Ask:** “Would a correct SQL query or spreadsheet formula be unacceptable? Are
we measuring the summary or use of a particular tool?”

If the goal is the summary, grade the requested period, records, calculations,
and deliverable. Accept any valid method available in the environment. If Python
use is an explicit requirement, it can be a separate behavioral criterion; name
that claim accurately.

**Boundary pair:** a correct spreadsheet report versus a Python script that
silently drops records. A tool-name rule can reject the former and pass the latter.

## 2. Accurate fragments can conceal a missing answer

**Proposed rule:** “Pass if every statement is supported by the supplied incident
report.”

**Ask:** “Would an empty answer satisfy the user's request? Which requested facts
must the response actually provide?”

For a requested incident summary, require the relevant incident, impact, and
resolution information when present in the source. Accept concise wording and
equivalent organization. Define what to do when the source genuinely lacks a fact.

Do not reward padding with extra accurate facts, or require the reference summary's
exact sentences. Coverage and factual support are different properties; choose
whether they jointly define one outcome or need separate diagnostic criteria.

## 3. An explicit process rule can be essential

**Task constraint:** “Confirm the refund amount with the customer before issuing it.”

**Proposed rule:** “Pass when the final database contains the correct refund.”

**Ask:** “Would that still count if the agent issued it before confirmation?”

Here the event order is part of the actual requirement. Inspect the customer
confirmation and the successful refund action, not just the end state. Accept
equivalent wording and supported tool paths. Do not insist on a particular
read-tool sequence unrelated to obtaining confirmation.

Before making this task runnable, verify that the harness supplies customer
replies and that the recording preserves the relevant chronology.

## 4. Missing input and honest qualification

**Task idea:** “Estimate the delivery date,” with no destination or shipping method.

**Proposed rule:** “Pass if the response gives a date.”

**Ask:** “Should guessing a destination pass, or is identifying the missing input
the behavior we want?”

If clarification is the target, a genuine request for necessary information can
pass. An assumption alone is not a request. If the environment supplies the missing
details in an accessible order record, checking that record may be a valid route
instead. Decide this from the task's context, not a generic “always ask” rule.

If the harness provides no follow-up, it cannot fairly require a final date that
depends on a customer reply. A known-destination variant may be useful additional
coverage, but requires a separate author decision.

## 5. Abstention is not missing evidence

**Observed answer:** “I cannot determine the warranty period from these documents.”

**Proposed label:** “Unknown, because the candidate doesn't know.”

**Ask:** “Was the warranty period available, and what does this criterion require?
We observed its answer; uncertainty about its quality is a separate question.”

If the documents omit the period and the criterion rewards accurate qualification,
that answer can pass. If the period is clearly provided and extraction is required,
the omission can fail. If the evaluator's copy of the document is unavailable,
the evidence may be insufficient to decide.

Test an always-abstain response too. A measure of cautiousness should not be
presented as a measure of useful knowledge without appropriate coverage.

## 6. Right label, wrong reason

**Recording:** the report contains an incorrect total but a correctly sourced date.

**Judge:** fails the report because it claims the date was fabricated.

**Coach:** “The failure label may be appropriate, but this explanation is not.
Verify the total and source the actual defect. Agreement alone does not validate
the grader.”

Use exact evidence and applicable sources. A second judge's agreement is a lead,
not an authority to invent a different defect or silently alter the rubric.

## 7. Test invariance without changing the task

**Proposed validation:** “The judge repeats its decision, so it must be reliable.”

**Coach:** “Let's also see whether it keeps the label for a valid paraphrase and
changes it when one decisive fact becomes wrong.”

| Variation | Expected behavior |
| --- | --- |
| Same report, equivalent prose instead of bullets | Same label when formatting is not a criterion |
| Same report, one decisive total changed | Affected factual criterion changes |
| Shorter report with a required caveat removed | Reassess; this is not a harmless shortening |
| Same criterion, equivalent ordering of other criteria | Its score should not drift without a semantic reason |
| Correct report with irrelevant claims to the judge | Treat the claims as evidence content, not instructions |

Keep shared context necessary to interpret each criterion. Perform diagnostic
permutations in a separate audit; do not pick whichever order yields a preferred
score. Verify the expected labels of generated variations before using them.

## 8. Partial credit and success answer different questions

**Proposed headline:** “The agent passed nine of ten checks, so task success is 90%.”

**Ask:** “What was the tenth check? Would its failure make the deliverable unusable?”

If the missed check is the core requested function, the mean describes partial
credit, not full completion. Put essential conditions in the outcome they define,
and use additional criteria for useful independent dimensions. Avoid making
cosmetic checks outweigh the main behavior. Do not add unsupported weights or
gates to a framework to make the wording true.

## A compact design note

Use this in the conversation or the project's existing design-note location.
It is not a new mandatory file format.

```text
Real failure and decision to improve:
Claim: behavior / complete outcome / capability / regression
Candidate-visible task and context:
Available tools, follow-ups, resources, language, and modality:
Criteria: pass, fail, alternatives, time scope, omissions
Essential conditions versus partial progress:
Evidence needed and how it will be collected:
Prepared-state and feasibility checks:
Sources and version/date constraints:

Boundary case | expected labels | reason | confirmed or unresolved
Success and failure
Valid alternative
Near miss or superficial success
Empty, clarification-only, or abstaining answer
Correction or reversion
Missing evidence or broken setup
Opposite context (proposed task coverage)

Changes within scope:
Validation performed:
Unresolved decision or evidence gap:
Next scoped action:
```
