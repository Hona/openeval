# Artifact verification

Code judges are still plain functions. When the score depends on delivered code,
run it in a disposable OCI container rather than on the runner host.

```ts
// benchmark.ts
import { VERIFICATION_IMAGE, type Benchmark } from "@hona/openeval";
export default {
  models: ["example/model"],
  judge: { verification: { image: VERIFICATION_IMAGE, cpus: 2, memoryMiB: 4096, workspaceMiB: 2048, inputMiB: 256 } },
} satisfies Benchmark;
```

Build the candidate and standard verification images with `openeval image`.
`openeval image --verification` builds only the verification image. Custom images
must be built separately. Images resolve to immutable IDs before planning or
collection; a changed verification image invalidates judgment reuse, not the
candidate's delivered artifacts.

```ts
// judge.ts — trusted script content is an ordinary frozen local import/string.
import type { JudgeContext } from "@hona/openeval";
export const criteria = { correct: { name: "Correct output", categories: ["coding"] } };
export default async (ctx: JudgeContext) => {
  const result = await ctx.verification.run({
    revision: "final", cwd: ".", timeoutMs: 60_000,
    commands: [["bun", "/verification/check.mjs"]],
    files: { "check.mjs": "/* author's outcome checks */" },
    artifacts: ["checks.json", "screenshot.png"],
  });
  return { scores: { correct: {
    value: result.state === "completed" && result.exitCode === 0,
    reason: "Explain what the checks established or why they failed.",
    evidence: [{ kind: "verification", id: result.id }],
    measurements: { elapsedMs: result.elapsedMs },
  } } };
};
```

The primitive restores an initial or final snapshot, uploads trusted inputs to
`/verification`, runs argv arrays in order, and stops at a nonzero exit. It does
not choose scoring thresholds or interpret success. Judge setup/transfer/image
errors remain JudgeRun errors. A test exit or verification timeout is an
observation the authored criterion must interpret. Interrupted candidate work
still needs the rubric's evidence policy; a failed verification of an unfinished
prefix does not necessarily establish final-task failure.

## Isolation and bounds

- No host bind mounts, credentials, published ports, or network. Browser/server
  verification can use loopback **inside** the container.
- Read-only image filesystem, non-root command user, no capabilities, no privilege
  escalation, PID/CPU/memory limits, bounded workspace/temp storage, and a deadline.
- Trusted check inputs are root-owned and are not writable by delivered code.
- Commands, exit statuses, image/resource identity, logs, and requested regular
  output files are retained with the JudgeRun. Viewer previews never execute HTML
  or SVG from the delivered artifact.
- Workspace transfer defaults to 128 MiB; each output archive is limited to
  32 MiB; logs are limited to 1 MiB per stream and are marked when truncated.
- Containers self-expire. The parent also removes containers bearing only its
  unique execution label after worker interruption. No shared/broad cleanup.

The workspace tmpfs defaults to 512 MiB. Set `judge.verification.workspaceMiB`
for a larger restored project or prepared dependency tree. The value must be a
positive integer no larger than `memoryMiB` (which defaults to 4096). It is
retained in verification receipts and code-judge identity. Omitting it preserves
existing identities and limits. Network, credentials, privileges, transfer caps,
and the read-only image filesystem are unchanged.

For larger source snapshots, set `judge.verification.inputMiB` to a positive
integer archive limit. This is separate from `workspaceMiB`: increasing storage
alone does not increase the transfer limit. The configured byte count must be a
safe integer. Non-default limits are retained in receipts and code-judge identity;
omitting the field or setting it to 128 preserves existing identities. Output and
log caps, filesystem permissions, network access, and container isolation stay
unchanged. Provision enough workspace storage for the actual restored files and
any verification-generated data.

The standard image includes Bun 1.4.2, Python, Git, Node, and Playwright 1.63.0
with Chromium. Import Playwright from
`/opt/verify/node_modules/playwright/index.mjs`. Dependencies needed by a task
must be available in the image or supplied as frozen inputs; network installs
are intentionally unavailable. Materialization alone is not a sandbox.
`verification.text(result, "stdout" | "stderr")` reads the retained bounded logs;
those names are reserved and cannot also name output artifacts.

The primitive verifies a reconstructed artifact. It does **not** prove what was
alive in the original candidate container, whether the candidate ran a test,
or whether original game actions were legal. Those claims need original recording
evidence. Do not put evaluator scripts in candidate workspaces.

## Readable judgments and controls

`openeval prepare --output <new-directory>` assembles real candidate inputs and
runs declared preparation in the candidate image, then archives the prepared
workspace. `--only-eval` scopes it. This makes zero model calls, creates no
EvalRun/JudgeRun, and does not change selections. Use it to prove fixture setup
before collection; it does not prove agent success or human task duration.

Existing boolean, numeric, and null scores remain sufficient. Optional structured
scores add `reason`, `evidence`, and JSON `measurements`. These details appear in
the normal viewer beside verification receipts; arbitrary returned JSON remains
inspectable. Declared code criteria must be returned exactly. Missing evidence
references are judging errors, not candidate zeros.
Arrays of named check observations render as readable tables, including author
supplied pass/fail details. They do not introduce additional scores or weights.
Large tables are explicitly bounded in the display; full returned JSON is retained.

`recordEvidence({ workspace: { initial, final }, ... })` can retain constructed
artifact controls without executing them. `judgeEvidence` then uses the same
public verification primitive. Constructed controls prove tested boundaries, not
human-duration calibration or live candidate feasibility.

Unused `criteria` labels/categories are removed from executable bundling. Debug
source maps remain retained but do not affect code identity. If grading reads a
metadata value, it is executable behavior and remains fingerprinted. Changes to
criterion IDs, actual grading code, imported inputs, dependencies, or verification
environment are not reporting-only edits. The verification environment is part
of judge identity only for evals with `judge.ts`. Rebuilding the image does not
rejudge Markdown-only evals.
