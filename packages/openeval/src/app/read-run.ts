import { resolve } from "node:path";
import { Results } from "../infra/sqlite";
import { CandidateEvidence } from "../infra/evidence";
import type { EvidenceRef, Judgment } from "../types";
import type { EvidenceView } from "../evidence";
import { validateCitations } from "../infra/judging/contract";

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

/** Reference integrity only; interpretation of task facts stays in judge.md. */
export async function verifyJudgmentEvidence(
  judgment: Judgment,
  reference: EvidenceRef,
) {
  const evidence = await readEvidence(reference);
  await validateCitations(judgment, evidence);
  return {
    hash: evidence.checkpoint.hash,
    metrics: judgment.metrics.length,
  };
}
