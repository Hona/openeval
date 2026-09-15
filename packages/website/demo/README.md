# Recorded OpenEval demo

`benchmark.ts` and `evals/` are the runnable sources for the two overview examples.
The website imports their prompts and judges directly. The collection uses three
repetitions, the six models declared here, and the published OpenEval 0.3.2 CLI
with OpenCode 2.0.3.

- `recording/` is an allowlisted public export of one completed BenchmarkRun.
- `results/` is the private, ignored evidence store. Keep it out of public assets.
- `results.ts` projects the export for the overview and Markdown. It contains no
  authored scores or usage measurements.
- `calculator.ts` is the separate interactive scoring explanation.

The collected run is `benchmark_fe92a2ec-674b-42a1-a572-c487e7a5c283`.
It has 36 selected candidate runs, 18 LLM judgments, and 18 code judgments.
Two candidate startup failures and one code-judge launch failure are retained
in the private history; the current candidate selections and their judge history
are included in the export. The reported spend was $2.671203454. The two startup
failures have unavailable cost accounting, so totals retain the SDK's lower-bound
state rather than asserting a complete bill.

The public export contains native candidate and LLM-judge message projections,
judgments, citation evidence, code-judge source/output, and recorded metrics.
Provider continuation state, host paths, and redundant stream fragments are
filtered before publication. Full messages are sanitized before previews and
pages are generated. `manifest.json` records the filtering counts and SHA-256
identities of every published data object.

Homepage costs include candidate and judge spend; tool calls and input tokens
are candidate-only measurements. Duration uses the union of selected candidate
and judge execution intervals. The full viewer retains each measurement's scope.

## Collect and export

Use a released CLI in a separate consumer, then run from this benchmark directory:

```sh
bunx --bun @hona/openeval image
bunx --bun @hona/openeval plan
bunx --bun @hona/openeval run --max-cost BUDGET
```

A fresh benchmark has no empirical cost estimate. Start with a small scoped
collection, inspect spend, then apply the remaining admission budget to the
remaining work. Keep all attempts and use explicit retry/rejudge operations for
infrastructure failures.

From a checkout with this export feature, build the bundled viewer and export
to a new directory:

```sh
bun run release:pack
bun run start export PATH_TO_RUN --output NEW_PUBLIC_DIRECTORY
```

For website data only, call the public `exportViewer` API without `assetsPath`.
Review and verify the new export before replacing the website's selected
`recording/` directory. Website builds read the selected export; they never
collect candidates or call a judge model.
