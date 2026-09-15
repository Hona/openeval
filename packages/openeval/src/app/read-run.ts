import { resolve } from "node:path";
import { Results } from "../infra/sqlite";
import { CandidateEvidence } from "../infra/evidence";
import type { EvidenceRef, Judgment } from "../types";
import type { EvidenceView } from "../evidence";
import { validateCitations } from "../infra/judging/contract";
import { openRecording } from "../infra/recording";
import { tmpdir } from "node:os";

/** Read-only records for maintenance clients. Finalized evidence remains authoritative. */
export function readBenchmarkRun(directory: string) {
  using results = new Results(resolve(directory, "runner.db"), true);
  return results.readSnapshot(() => {
    const benchmark = results.benchmark;
    if (!benchmark) throw new Error("No benchmark run in this directory");
    const judges = results.judgeRuns();
    return {
      benchmark,
      slots: results.slots(),
      evals: results.evalRuns(),
      judges,
      checks: judges.flatMap((judge) => results.judgeChecks(judge.id)),
    };
  });
}

export async function readEvidence(
  reference: EvidenceRef,
): Promise<EvidenceView> {
  const ref = { ...reference, directory: resolve(reference.directory) };
  return (await CandidateEvidence.open(ref.directory, ref.hash)).view(ref);
}

/** Open all recorded data with lazy native readers; dispose after inspection. */
export async function readRecording(directory: string, evalRunId: string) {
  using results = new Results(resolve(directory, "runner.db"), true);
  const run = results.evalRun(evalRunId);
  if (!run?.evidence)
    throw new Error("Select an EvalRun with finalized evidence");
  return openRecording(
    {
      run,
      runDirectory: resolve(directory),
      evidence: {
        ...run.evidence,
        directory: resolve(directory, run.evidence.directory),
      },
    },
    process.platform === "win32" ? "C:/tmp/opencode" : tmpdir(),
  );
}

/** Reference integrity only; interpretation of task facts stays in the judges. */
export async function verifyJudgmentEvidence(
  judgment: Judgment,
  reference: EvidenceRef,
) {
  const evidence = await readEvidence(reference);
  await validateCitations(judgment, evidence);
  return {
    hash: evidence.checkpoint.hash,
    criteria: Object.keys(judgment.scores).length,
  };
}
