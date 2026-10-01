import type { BenchmarkRun } from "../types";
import type { Results } from "../infra/sqlite";

/** A live runner saves its heartbeat every five seconds. */
export const STOPPED_RUNNER_MS = 120_000;

export const runnerStopped = (
  benchmark: Pick<BenchmarkRun, "state" | "updatedAt">,
  now = Date.now(),
) =>
  benchmark.state === "running" &&
  now - Date.parse(benchmark.updatedAt) > STOPPED_RUNNER_MS;

/** Close the executions a stopped runner left open. Their records stay; the planner repeats the work. */
export function recoverStoppedRunner(results: Results, now = new Date()) {
  const time = now.toISOString();
  const elapsedMs = (startedAt: string) =>
    Math.max(0, now.getTime() - Date.parse(startedAt));
  const recovered = { evalRuns: 0, judgeRuns: 0 };
  results.transaction(() => {
    for (const run of results.judgeRuns()) {
      if (run.state !== "running") continue;
      for (const check of results.judgeChecks(run.id))
        if (check.state === "running")
          results.finishJudgeCheck({
            ...check,
            state: "cancelled",
            completedAt: time,
          });
      results.finishJudge({
        ...run,
        state: "failed",
        interrupted: true,
        error: "The runner stopped before judging finished",
        completedAt: time,
        elapsedMs: elapsedMs(run.startedAt),
      });
      recovered.judgeRuns++;
    }
    for (const run of results.evalRuns()) {
      if (run.state !== "running") continue;
      results.finishEval({
        ...run,
        state: "failed",
        interrupted: true,
        error: "The runner stopped before this session finished",
        completedAt: time,
        elapsedMs: elapsedMs(run.startedAt),
        ...(run.stop ? { stop: { ...run.stop, applied: false } } : {}),
      });
      recovered.evalRuns++;
    }
    results.saveBenchmark({
      ...results.benchmark!,
      state: "incomplete",
      scheduledSlotIds: [],
      updatedAt: time,
    });
  });
  return recovered;
}
