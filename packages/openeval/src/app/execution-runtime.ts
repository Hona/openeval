import type { BenchmarkRun, EvalRun, JudgeRun } from "../types";
import type { Results } from "../infra/sqlite";
import { mergeRuntime, timestampMs, type RuntimeInterval } from "../runtime";

/** Read-only projection; finalized runs and their original timestamps are untouched. */
export function executionRuntime(
  run: EvalRun | JudgeRun,
  results: Results,
  benchmark: BenchmarkRun,
  now: number,
  current = true,
): RuntimeInterval[] {
  const start = timestampMs(run.startedAt),
    completed = timestampMs(run.completedAt);
  if (start === undefined) return [];
  const heartbeat = timestampMs(benchmark.updatedAt) ?? start;
  const live =
    current &&
    run.state === "running" &&
    benchmark.state === "running" &&
    now - heartbeat <= 30_000;
  const lastObserved =
    !current && completed === undefined
      ? (results.eventBounds(run.id)?.last ?? start)
      : undefined;
  const closing = completed ?? Math.min(now, lastObserved ?? heartbeat);
  const interval = (begin: number, end?: number): RuntimeInterval[] =>
    Number.isFinite(begin) &&
    (end === undefined || (Number.isFinite(end) && end >= begin))
      ? [{ start: begin, ...(end === undefined ? {} : { end }) }]
      : [];

  if (!("evalRunId" in run.input) || run.input.mode !== "monitor") {
    const end =
      completed !== undefined
        ? completed
        : live
          ? undefined
          : Math.min(closing, start + run.input.timeoutMs);
    return interval(start, end);
  }

  // A persistent judge is idle between checks. Its session lifetime is not work.
  const judge = run as JudgeRun;
  const checks = results.judgeChecks(run.id);
  const intervals = checks.flatMap((check) => {
    const begin = timestampMs(check.executionStartedAt);
    if (begin === undefined) return []; // Cancelled before obtaining a worker.
    const end =
      timestampMs(check.completedAt) ??
      (live && judge.activity === "checking" ? undefined : closing);
    return interval(begin, end);
  });
  const archiveStart = timestampMs(judge.archiveStartedAt);
  if (archiveStart !== undefined)
    intervals.push(
      ...interval(
        archiveStart,
        live && judge.activity === "finalizing" ? undefined : closing,
      ),
    );
  return mergeRuntime(intervals);
}
