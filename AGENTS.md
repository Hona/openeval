# OpenEval

- Keep SDK use cases in `packages/openeval/src/app` and mechanics in `src/infra`.
- Keep the reusable CLI in `packages/openeval/src/cli.ts` and viewer source in `packages/viewer`.
- Benchmark clients supply their own declarations, prompts, rubrics, and fixtures.
- Never import private benchmark content or maintenance code into this repository.
- Preserve finalized EvalRun and JudgeRun evidence; update active scores through selections.
- Use Benchmark, BenchmarkRun, Eval, EvalRun, and JudgeRun terminology.
- Candidate containers contain no evaluator code, judge inputs, or evidence storage.
- Verify changes with `bun run typecheck` and `bun test`; unit tests must not call live models.
- Verify release archives with `bun run release:pack` and `bun run release:verify`.
