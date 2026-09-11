import { resolve } from "node:path";
import type { ExecutionObserver, JudgeRun } from "../types";
import { Results } from "../infra/sqlite";
import { loadBenchmark } from "./load-benchmark";
import { judgeFingerprint } from "./plan-benchmark";
import { judgeEvalRun } from "./judge-run";
import { executeQueue, finishBenchmark } from "./run-benchmark";
import { judgingFingerprint } from "../infra/judging";
import { canJudgeEval } from "./eval-state";

/** Rejudging changes only the selected judgment. The candidate execution is never repeated. */
export async function judgeRun(
  directory: string,
  evalRunId: string,
  onEvent?: ExecutionObserver,
): Promise<JudgeRun> {
  return (await judgeRuns(directory, [evalRunId], onEvent))[0]!;
}

/** Rejudge selected evidence with the benchmark's work-conserving concurrency limit. */
export async function judgeRuns(
  directory: string,
  evalRunIds: readonly string[],
  onEvent?: ExecutionObserver,
): Promise<JudgeRun[]> {
  if (!evalRunIds.length) return [];
  using results = new Results(resolve(directory, "runner.db"));
  const previous = results.benchmark!;
  if (previous.mergedInto)
    throw new Error(
      `This run was merged into ${previous.mergedInto}; use the aggregate run`,
    );
  if (previous.state === "running")
    throw new Error("Wait for the active benchmark run");
  const candidates = [...new Set(evalRunIds)].map((evalRunId) => {
    const candidate = results.evalRun(evalRunId);
    if (!canJudgeEval(candidate))
      throw new Error(
        "Select a completed, stopped, or timed-out eval run with finalized evidence",
      );
    if (results.slot(candidate.slotId)?.evalRunId !== candidate.id)
      throw new Error(
        "This eval run has been superseded; select the active execution",
      );
    return candidate;
  });
  const current = await loadBenchmark(previous.source);
  const definition = {
    ...previous.definition,
    judge: current.judge,
    evals: previous.definition.evals.map((evalDefinition) => {
      const updated = current.evals.find(
        (item) => item.id === evalDefinition.id,
      );
      return updated
        ? {
            ...evalDefinition,
            judge: updated.judge,
            judgeHash: updated.judgeHash,
            metrics: updated.metrics,
            name: updated.name,
          }
        : evalDefinition;
    }),
  };
  const runtime = {
    ...previous.runtime,
    judgeHash: await judgingFingerprint(),
  };
  const selected = new Set(candidates.map((candidate) => candidate.slotId));
  results.transaction(() => {
    if (results.benchmark?.state === "running")
      throw new Error("Another operation claimed this benchmark run");
    for (const slot of results.slots()) {
      if (!selected.has(slot.id)) continue;
      if (!definition.evals.some((item) => item.id === slot.evalId)) continue;
      const judgeHash = judgeFingerprint(definition, slot.evalId);
      if (slot.judgeHash !== judgeHash)
        results.select({
          ...slot,
          judgeHash,
          judgeRunId: null,
        });
      else results.select(slot);
    }
    results.saveBenchmark(
      {
        ...previous,
        definition,
        runtime,
        state: "running",
        scheduledSlotIds: [...selected],
        updatedAt: new Date().toISOString(),
      },
      true,
    );
  });
  const context = {
    directory: resolve(directory),
    definition,
    runtime,
    results,
    onEvent,
  };
  const timer = setInterval(
    () =>
      results.saveBenchmark({
        ...results.benchmark!,
        updatedAt: new Date().toISOString(),
      }),
    5000,
  );
  try {
    const judgments = new Map<string, JudgeRun>();
    await executeQueue(
      candidates,
      definition.concurrency,
      async (candidate) => {
        judgments.set(candidate.id, await judgeEvalRun(context, candidate));
      },
    );
    return candidates.map((candidate) => judgments.get(candidate.id)!);
  } finally {
    clearInterval(timer);
    finishBenchmark(context);
  }
}
