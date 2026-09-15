# OpenEval

- Keep SDK use cases in `packages/openeval/src/app` and mechanics in `src/infra`.
- Keep the reusable CLI in `packages/openeval/src/cli.ts` and viewer source in `packages/viewer`.
- Keep the landing page and eval-author documentation in `packages/website`, using the viewer's OC-2 components and theme.
- Benchmark clients supply their own declarations, prompts, rubrics, and fixtures.
- For eval design, authoring, or review, load the `eval-writing` skill in `.opencode/skills/eval-writing/SKILL.md`.
- Never import private benchmark content or maintenance code into this repository.
- Preserve finalized EvalRun and JudgeRun evidence; update active scores through selections.
- Use Benchmark, BenchmarkRun, Eval, EvalRun, and JudgeRun terminology.
- Candidate containers contain no evaluator code, judge inputs, or evidence storage.
- Verify changes with `bun run typecheck` and `bun test`; unit tests must not call live models.
- Verify release archives with `bun run release:pack` and `bun run release:verify`.

## Ubiquitous language

- Follow [TERMINOLOGY.md](TERMINOLOGY.md) in code, documentation, examples, and UI copy.
- A Benchmark contains Evals. An Eval defines a task and a Rubric. A Rubric contains Criteria and their scoring rules. A Judge produces a Judgment with Criterion scores.
- Use Criterion (plural Criteria) for a named graded requirement. Use Score for awarded credit or an aggregate. Reserve Metric for observed or calculated measurements such as tokens, USD cost, and tool error rate.
- A measurement affects the score only through an author-defined criterion. Keep measurement units and scoring meaning explicit.
- Judge covers code-based, LLM-based, and hybrid implementations. Use LLM judge when that distinction matters. Name the planned injected context JudgeContext; do not introduce ScorerContext or ScorerRun.
- Use BenchmarkRun, EvalRun, and JudgeRun for execution records. A recording retains execution data; a trace presents recorded activity; evidence supports a judgment.
- Canonical rubric headings use `## Criterion: id — Label`. The published 0.2.2 SDK still requires the legacy `## Metric:` spelling and legacy API identifiers. Label those compatibility names clearly and keep runnable examples compatible with their pinned release.
- New interfaces and prose use criterion/criteria for grading. Preserve literal legacy wire fields, historical quotations, and external source titles; use adapters for migrations instead of rewriting finalized evidence.
- Keep documented release support accurate. JudgeContext and executable judge.ts are planned for 0.3.0, not exports of 0.2.2. Unequal weights and category-specific policies are separate future work.
- Review documentation and UI copy against the glossary. Update the glossary and website definitions together when an approved term changes; the existing website verifier checks that they agree.
