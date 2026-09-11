import type { ActivityRun, LiveEvalRun } from "./types";
import { runtimeMs, runtimeClock, stageRuntime } from "@hona/openeval/view";
/** The slot no longer occupies a worker: both stages ended or the eval stopped. */
const settled = (run: LiveEvalRun) =>
  run.status === "completed" || run.status === "failed";
export const evalDone = (run: LiveEvalRun) =>
  ["completed", "stopped", "failed", "timed_out"].includes(run.eval.status);
export const scored = (run: LiveEvalRun) =>
  typeof run.judge.score === "number" &&
  run.judge.score >= 0 &&
  run.judge.score <= 1;
const activeStages = (run: LiveEvalRun) =>
  (run.eval.status === "in_progress" ? 1 : 0) +
  (run.judge.status === "in_progress" ? 1 : 0);
/** Stage cards finished well: a completed eval run plus a scored judgment. */
const stagesCompleted = (run: LiveEvalRun) =>
  (["completed", "stopped"].includes(run.eval.status) ? 1 : 0) +
  (scored(run) ? 1 : 0);
const stagesNeedingAttention = (run: LiveEvalRun) =>
  (["failed", "timed_out", "interrupted"].includes(run.eval.status) ? 1 : 0) +
  (["failed", "timed_out", "interrupted", "blocked"].includes(
    run.judge.status,
  ) || run.judge.score === null
    ? 1
    : 0);
const modelKey = (run: LiveEvalRun) =>
  JSON.stringify([run.model, run.reasoning]);

export function activityProgress(groups: ActivityRun[], now: number) {
  const running = groups.some(
    (group) =>
      group.state.status === "running" &&
      now - Date.parse(group.state.heartbeatAt) <= 30_000,
  );
  const rows = groups
    .toSorted((a, b) => a.state.evalOrder - b.state.evalOrder)
    .flatMap((group) =>
      group.state.runs.map((run) => ({
        eval: group.state.eval,
        run,
        key: `${group.id}:${run.id}`,
      })),
    );
  const models = [...new Set(rows.map(({ run }) => modelKey(run)))].map(
    (key) => {
      const runs = rows
        .filter(({ run }) => modelKey(run) === key)
        .map(({ run }) => run);
      return {
        key,
        model: runs[0].model,
        reasoning: runs[0].reasoning,
        // Each slot is two stage cards: its eval run and its judge.
        total: runs.length * 2,
        completed: runs.reduce((sum, run) => sum + stagesCompleted(run), 0),
        attention: runs.reduce(
          (sum, run) => sum + stagesNeedingAttention(run),
          0,
        ),
        active: running
          ? runs.reduce((sum, run) => sum + activeStages(run), 0)
          : 0,
        scheduled: runs.some((run) => run.scheduled),
        stopped: runs.filter((run) =>
          ["cancelled", "interrupted"].includes(run.status),
        ).length,
      };
    },
  );
  type Kind = "eval" | "judge";
  // Learn service time per stage. A later rejudge never extends its candidate's duration.
  const samples = rows.flatMap((row) =>
    (["eval", "judge"] as const).flatMap((kind) => {
      const stage = row.run[kind],
        duration = stageRuntime(stage, now);
      return ["completed", "stopped"].includes(stage.status) &&
        duration > 0 &&
        Date.parse(stage.completedAt!) <= now
        ? [{ ...row, kind, duration }]
        : [];
    }),
  );
  const concurrency = Math.max(
    1,
    ...groups.map((group) => group.state.concurrency),
  );
  const scoped = rows.filter(({ run }) => run.scheduled);
  const queued = scoped.filter(({ run }) => run.eval.status === "queued");
  const elapsedMs = runtimeMs(
    groups.flatMap((group) => {
      const clock = runtimeClock(
        now,
        group.state.heartbeatAt,
        group.state.status === "running",
      );
      return group.state.runtime.map((interval) => ({
        ...interval,
        end: interval.end ?? clock,
      }));
    }),
    now,
  );
  let remainingMs: number | null = null;
  if (running && samples.length) {
    const comparable = (row: (typeof rows)[number], kind: Kind) => {
      const stages = samples.filter((sample) => sample.kind === kind);
      const exact = stages.filter(
        (sample) =>
          sample.eval === row.eval &&
          modelKey(sample.run) === modelKey(row.run),
      );
      if (exact.length) return exact;
      const evalMatches = stages.filter((sample) => sample.eval === row.eval);
      if (evalMatches.length) return evalMatches;
      const modelMatches = stages.filter(
        (sample) => modelKey(sample.run) === modelKey(row.run),
      );
      return modelMatches.length ? modelMatches : stages;
    };
    const mean = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    const duration = (row: (typeof rows)[number], kind: Kind) => {
      const age = stageRuntime(row.run[kind], now);
      const durations = comparable(row, kind).map((sample) => sample.duration),
        longer = durations.filter((value) => value > age);
      if (!durations.length) return undefined;
      return Math.max(
        1000,
        longer.length ? mean(longer) - age : mean(durations) * 0.25,
      );
    };
    type Job = {
      id: string;
      kind: Kind;
      duration: number;
      active: boolean;
      dependency?: string;
    };
    const jobs: Job[] = [],
      finishes = new Map<string, number>();
    let unknown = false;
    for (const row of scoped) {
      const evalPending = ["queued", "in_progress"].includes(
        row.run.eval.status,
      );
      const judgePending =
        ["queued", "in_progress", "watching"].includes(row.run.judge.status) ||
        (row.run.judge.status === "waiting" &&
          (evalPending ||
            ["completed", "stopped", "timed_out"].includes(
              row.run.eval.status,
            )));
      if (!evalPending) finishes.set(`${row.key}:eval`, 0);
      for (const kind of ["eval", "judge"] as const) {
        if (!(kind === "eval" ? evalPending : judgePending)) continue;
        const remaining = duration(row, kind);
        if (remaining === undefined) {
          unknown = true;
          continue;
        }
        const active = row.run[kind].status === "in_progress";
        jobs.push({
          id: `${row.key}:${kind}`,
          kind,
          duration: remaining,
          active,
          dependency:
            kind === "judge" && !active && evalPending
              ? `${row.key}:eval`
              : undefined,
        });
      }
    }
    if (!unknown && jobs.length) {
      const workers = jobs
        .filter((job) => job.active)
        .map((job) => {
          finishes.set(job.id, job.duration);
          return job.duration;
        });
      while (workers.length < concurrency) workers.push(0);
      const pending = jobs.filter((job) => !job.active);
      while (pending.length) {
        const worker = workers.indexOf(Math.min(...workers));
        const ready = pending.filter(
          (job) => !job.dependency || finishes.has(job.dependency),
        );
        const readyAt = (job: Job) =>
          job.dependency ? finishes.get(job.dependency)! : 0;
        const immediate = ready.filter(
          (job) => readyAt(job) <= workers[worker],
        );
        const job =
          immediate.find((job) => job.kind === "judge") ??
          immediate[0] ??
          ready.sort((a, b) => readyAt(a) - readyAt(b))[0];
        if (!job) {
          unknown = true;
          break;
        }
        workers[worker] =
          Math.max(workers[worker], readyAt(job)) + job.duration;
        finishes.set(job.id, workers[worker]);
        pending.splice(pending.indexOf(job), 1);
      }
      if (!unknown) remainingMs = Math.max(...workers);
    }
  }
  return {
    models,
    total: rows.length,
    finished: rows.filter(({ run }) => settled(run)).length,
    evals: rows.filter(({ run }) => evalDone(run)).length,
    scored: rows.filter(({ run }) => scored(run)).length,
    attention: rows.filter(({ run }) => run.attention).length,
    active: running
      ? rows.reduce((sum, { run }) => sum + activeStages(run), 0)
      : 0,
    queued: queued.length,
    running,
    samples: samples.length,
    concurrency,
    elapsedMs,
    remainingMs,
    finishAt: remainingMs === null ? null : now + remainingMs,
  };
}
export function estimateDuration(ms: number) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
}
