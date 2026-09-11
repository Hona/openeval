import { readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { Results } from "../infra/sqlite";
import type { BenchmarkRun, EvalRun, JudgeRun, Slot, Cost } from "../types";
import type {
  ResultEntry,
  ResultIndex,
  ResultSummary,
  EvalRunIndex,
  EvalRunSummary,
  ActivityRun,
  LiveEvalRun,
  StageState,
  StageStatus,
  JudgeAudit,
} from "../view";
import { sumCosts } from "../view";
import { benchmarkScores } from "./scores";
import { executionRuntime } from "./execution-runtime";
import {
  mergeRuntime,
  runtimeMs,
  runtimeClock,
  timestampMs,
  type RuntimeInterval,
} from "../runtime";
import { canJudgeEval } from "./eval-state";
import { CandidateEvidence, type EvidenceQuery } from "../infra/evidence";

const scheduled = (slot: Slot, benchmark: BenchmarkRun, now: number) =>
  benchmark.state === "running" &&
  now - Date.parse(benchmark.updatedAt) <= 30_000 &&
  benchmark.scheduledSlotIds.includes(slot.id);

const costOf = (run: EvalRun | JudgeRun, results?: Results): Cost => {
  const usd = run.session?.accounting?.costUSD;
  return {
    usd: usd ?? null,
    reportedUSD: usd ?? results?.recordedCost(run.id) ?? 0,
    complete: usd !== undefined,
  };
};
// Execution IDs are unique, including after merging runs.
const runCosts = (runs: (EvalRun | JudgeRun)[], results: Results) => {
  const unique = new Map(runs.map((run) => [run.id, run]));
  return sumCosts([...unique.values()].map((run) => costOf(run, results)));
};
const entryOf = (
  run: BenchmarkRun,
  id = run.id,
  evalId?: string,
): ResultEntry => ({
  id,
  kind: evalId ? "eval" : "benchmark",
  name: evalId
    ? (run.definition.evals.find((item) => item.id === evalId)?.name ?? evalId)
    : run.name,
  status: run.state,
  startedAt: run.createdAt,
  updatedAt: Date.parse(run.updatedAt),
  models: run.definition.models.length,
  evals: evalId ? 1 : run.definition.evals.length,
});
export const evalResultId = (benchmarkId: string, evalId: string) =>
  `${benchmarkId}~${encodeURIComponent(evalId)}`;

/** Read-only, typed results access shared by the CLI and viewer API. */
export class ResultReader {
  private paths = new Map<string, string>();
  private runtimes = new Map<string, RuntimeInterval[]>();
  constructor(readonly root: string) {}
  private runtime(
    run: EvalRun | JudgeRun,
    results: Results,
    benchmark: BenchmarkRun,
    now: number,
    candidate?: EvalRun,
  ) {
    const key = `${results.path}:${run.id}`;
    const cached = this.runtimes.get(key);
    if (cached) return cached;
    let current = true;
    if (run.state === "running") {
      const slot = candidate ? results.slot(candidate.slotId) : undefined;
      current =
        !!slot &&
        slot.evalRunId === candidate?.id &&
        scheduled(slot, benchmark, now);
      if (current && "evalRunId" in run.input)
        current =
          results
            .judgeRuns()
            .filter(
              (judge) =>
                judge.input.evalRunId === candidate!.id &&
                judge.input.judgeHash === slot!.judgeHash,
            )
            .at(-1)?.id === run.id;
    }
    const intervals = executionRuntime(run, results, benchmark, now, current);
    if (run.completedAt) this.runtimes.set(key, intervals);
    return intervals;
  }
  async index(): Promise<ResultIndex> {
    const entries: ResultEntry[] = [],
      warnings: string[] = [];
    const paths = new Map<string, string>();
    const aliases = new Map<string, string>();
    for (const directory of await readdir(this.root, {
      withFileTypes: true,
    }).catch(() => [])) {
      if (!directory.isDirectory()) continue;
      const path = resolve(this.root, directory.name, "runner.db");
      if (!(await Bun.file(path).exists())) continue;
      try {
        using results = new Results(path, true);
        const run = results.benchmark;
        if (!run) continue;
        if (run.mergedInto) {
          aliases.set(run.id, run.mergedInto);
          continue;
        }
        paths.set(run.id, path);
        entries.push(entryOf(run));
      } catch (error) {
        warnings.push(`${directory.name}: ${String(error)}`);
      }
    }
    entries.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    for (let pass = 0; pass < aliases.size; pass++)
      for (const [id, target] of aliases)
        if (paths.has(target)) paths.set(id, paths.get(target)!);
    this.paths = paths;
    return { public: false, root: this.root, entries, warnings };
  }
  private async database(id: string) {
    const benchmarkId = id.split("~")[0];
    if (!this.paths.has(benchmarkId)) await this.index();
    const path = this.paths.get(benchmarkId);
    if (!path) throw new Error("Unknown benchmark run");
    return new Results(path, true);
  }
  async recording(benchmarkId: string, executionId: string) {
    const results = await this.database(benchmarkId);
    const read = () =>
      results.evalRun(executionId) ?? results.judgeRun(executionId);
    if (!read()) {
      results.close();
      throw new Error("Unknown execution");
    }
    return {
      directory: dirname(results.path),
      read,
      events: (after: number) => results.events(executionId, after),
      close: () => results.close(),
    };
  }
  async judgeAudit(
    benchmarkId: string,
    judgeRunId: string,
  ): Promise<JudgeAudit> {
    using results = await this.database(benchmarkId);
    const judge = results.judgeRun(judgeRunId);
    if (!judge) throw new Error("Unknown judge run");
    return {
      judge: {
        id: judge.id,
        state: judge.state,
        activity: judge.activity,
        decisionCheckId: judge.decisionCheckId,
        monitorError: judge.monitorError,
        monitorErrorAt: judge.monitorErrorAt,
        monitorLimit: judge.monitorLimit,
        judgment: judge.judgment,
      },
      metrics: judge.input.metrics,
      stop: results.evalRun(judge.input.evalRunId)?.stop,
      checks: results.judgeChecks(judgeRunId).map((check) => {
        const start = timestampMs(check.executionStartedAt);
        const end =
          timestampMs(check.completedAt) ??
          runtimeClock(
            Date.now(),
            results.benchmark?.updatedAt,
            results.benchmark?.state === "running",
          );
        return {
          ...check,
          runtimeMs: start === undefined ? 0 : Math.max(0, end - start),
        };
      }),
      history: results
        .judgeRuns()
        .filter((run) => run.input.evalRunId === judge.input.evalRunId)
        .map((run) => ({
          id: run.id,
          state: run.state,
          startedAt: run.startedAt,
          mode: run.input.mode,
        })),
    };
  }
  async checkEvidence(
    benchmarkId: string,
    judgeRunId: string,
    checkId: string,
    query: EvidenceQuery,
  ) {
    using results = await this.database(benchmarkId);
    const check = results
      .judgeChecks(judgeRunId)
      .find((item) => item.id === checkId);
    const judge = results.judgeRun(judgeRunId);
    if (!judge || (checkId && !check)) throw new Error("Unknown judge check");
    const reference = check?.checkpoint ?? judge.input.evidence;
    const evidence = await CandidateEvidence.open(
      resolve(dirname(results.path), reference.directory),
      reference.hash,
    );
    return evidence.query(query);
  }
  async summary(id: string): Promise<ResultSummary> {
    using results = await this.database(id);
    const run = results.benchmark!,
      evalId = id.includes("~")
        ? decodeURIComponent(id.slice(id.indexOf("~") + 1))
        : undefined;
    const evals = run.definition.evals.filter(
      (item) => !evalId || item.id === evalId,
    );
    if (!evals.length) throw new Error("Unknown eval");
    const scores = results.readSnapshot(() =>
      benchmarkScores(
        run.definition,
        results.slots(),
        results.judgeRuns(),
        evalId,
      ),
    );
    const candidates = results.evalRuns(),
      allJudges = results.judgeRuns();
    const now = Date.now(),
      candidateIndex = new Map(candidates.map((run) => [run.id, run]));
    const evalRuntime = new Map<string, RuntimeInterval[]>();
    for (const execution of [...candidates, ...allJudges]) {
      const candidate =
        "evalRunId" in execution.input
          ? candidateIndex.get(execution.input.evalRunId)
          : (execution as EvalRun);
      if (!candidate) continue;
      const intervals = evalRuntime.get(candidate.input.evalId) ?? [];
      intervals.push(...this.runtime(execution, results, run, now, candidate));
      evalRuntime.set(candidate.input.evalId, intervals);
    }
    for (const [id, intervals] of evalRuntime)
      evalRuntime.set(id, mergeRuntime(intervals));
    const runtime = mergeRuntime(
      evalId
        ? (evalRuntime.get(evalId) ?? [])
        : [...evalRuntime.values()].flat(),
    );
    const evalCosts = Object.fromEntries(
      run.definition.evals.map((evalDefinition) => {
        const runs = candidates.filter(
            (candidate) => candidate.input.evalId === evalDefinition.id,
          ),
          ids = new Set(runs.map((candidate) => candidate.id));
        return [
          evalDefinition.id,
          runCosts(
            [
              ...runs,
              ...allJudges.filter((judge) => ids.has(judge.input.evalRunId)),
            ],
            results,
          ),
        ];
      }),
    );
    return {
      entry: entryOf(run, id, evalId),
      overview: {
        name: evalId ? evals[0].name : run.name,
        kind: evalId ? "eval" : "benchmark",
        status: run.state,
        startedAt: run.createdAt,
        completedAt: run.state === "running" ? undefined : run.completedAt,
        scores,
        evals: evals.map((item) => item.id),
        evalNames: Object.fromEntries(
          evals.map((item) => [item.id, item.name]),
        ),
        cost: evalId ? evalCosts[evalId] : sumCosts(Object.values(evalCosts)),
        evalCosts,
        runtime,
      },
      durationMs: runtimeMs(runtime, now),
      related: run.definition.evals.map((item) => ({
        id: evalResultId(run.id, item.id),
        eval: item.id,
        status: run.state,
        runtime: evalRuntime.get(item.id) ?? [],
        durationMs: runtimeMs(evalRuntime.get(item.id) ?? [], now),
      })),
    };
  }
  async evalRuns(id: string): Promise<EvalRunIndex> {
    const split = id.indexOf("~");
    if (split < 0) throw new Error("Select an eval");
    const evalId = decodeURIComponent(id.slice(split + 1));
    using results = await this.database(id);
    const benchmark = results.benchmark!,
      executions = results.evalRuns(),
      judges = results.judgeRuns();
    const runs = results
      .slots()
      .filter((slot) => slot.active && slot.evalId === evalId)
      .map((slot) => {
        const candidate = executions.find((run) => run.id === slot.evalRunId);
        const current = liveRun(
          slot,
          candidate,
          judges,
          benchmark,
          results,
          (run) => this.runtime(run, results, benchmark, Date.now(), candidate),
        );
        const related = executions.filter((run) => run.slotId === slot.id),
          ids = new Set(related.map((run) => run.id));
        return {
          ...current,
          cost: runCosts(
            [
              ...related,
              ...judges.filter((run) => ids.has(run.input.evalRunId)),
            ],
            results,
          ),
          elapsedMs: runtimeMs(
            [...current.eval.runtime, ...current.judge.runtime],
            Date.now(),
          ),
        };
      });
    return {
      entry: entryOf(benchmark, id, evalId),
      eval: evalId,
      benchmarkId: benchmark.id,
      runs,
    };
  }
  async activity(): Promise<ActivityRun[]> {
    const index = await this.index(),
      out: ActivityRun[] = [];
    for (const entry of index.entries) {
      using results = await this.database(entry.id);
      const benchmark = results.benchmark!;
      const summary = await this.summary(entry.id);
      for (const [
        evalOrder,
        evalDefinition,
      ] of benchmark.definition.evals.entries()) {
        const id = evalResultId(benchmark.id, evalDefinition.id),
          runs = await this.evalRuns(id);
        out.push({
          id,
          benchmarkId: benchmark.id,
          resultId: id,
          cost: summary.overview.evalCosts[evalDefinition.id],
          state: {
            id,
            eval: evalDefinition.id,
            benchmark: benchmark.id,
            startedAt: benchmark.createdAt,
            heartbeatAt: benchmark.updatedAt,
            status: benchmark.state,
            concurrency: benchmark.definition.concurrency,
            evalOrder,
            runs: runs.runs,
            runtime: summary.related.find(
              (item) => item.eval === evalDefinition.id,
            )!.runtime,
          },
        });
      }
    }
    return out;
  }
}

function stageState(
  run: EvalRun | JudgeRun | undefined,
  stale: boolean,
  waitingStatus: StageStatus,
  results: Results,
  runtime: RuntimeInterval[],
): StageState {
  if (!run) return { status: waitingStatus, runtime };
  const status: StageStatus =
    run.state === "running"
      ? stale
        ? "interrupted"
        : "activity" in run && run.activity === "watching"
          ? "watching"
          : "activity" in run && run.activity === "queued"
            ? "queued"
            : "in_progress"
      : run.state === "completed"
        ? "completed"
        : run.state === "stopped"
          ? "stopped"
          : run.state === "timed_out"
            ? "timed_out"
            : "failed";
  return {
    executionId: run.id,
    status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    elapsedMs: runtimeMs(runtime, Date.now()),
    runtime,
    cost: costOf(run, results),
    message: run.error,
  };
}

function liveRun(
  slot: Slot,
  candidate: EvalRun | undefined,
  judges: JudgeRun[],
  benchmark: BenchmarkRun,
  results: Results,
  runtime: (run: EvalRun | JudgeRun) => RuntimeInterval[],
): LiveEvalRun {
  const judge = judges
    .filter(
      (run) =>
        run.input.evalRunId === candidate?.id &&
        run.input.judgeHash === slot.judgeHash,
    )
    .at(-1);
  const executing = judge ?? candidate;
  const stale =
    benchmark.state === "running" &&
    Date.now() - Date.parse(benchmark.updatedAt) > 30_000;
  const judgeReady = canJudgeEval(candidate);
  const stage = judge || judgeReady ? "judge" : "candidate";
  const status: LiveEvalRun["status"] =
    executing?.state === "running"
      ? stale
        ? "interrupted"
        : "in_progress"
      : executing &&
          ["failed", "timed_out"].includes(executing.state) &&
          (judge || !judgeReady)
        ? "failed"
        : slot.judgeRunId
          ? "completed"
          : "queued";
  const evalStage = stageState(
    candidate,
    stale,
    "queued",
    results,
    candidate ? runtime(candidate) : [],
  );
  const judgeBlocked =
    !judgeReady &&
    ["completed", "failed", "timed_out", "interrupted"].includes(
      evalStage.status,
    );
  const judgeStage: StageState = {
    ...stageState(
      judge,
      stale,
      judgeBlocked ? "blocked" : judgeReady ? "queued" : "waiting",
      results,
      judge ? runtime(judge) : [],
    ),
    ...(!judge && judgeBlocked
      ? {
          message:
            "Blocked: no finalized eval evidence is available. Retry the eval before judging.",
        }
      : {}),
    ...(judge?.state === "completed"
      ? {
          score: judge.judgment?.value ?? null,
          metrics: judge.judgment?.metrics,
        }
      : {}),
  };
  const attention = ["failed", "timed_out", "interrupted"].includes(
    evalStage.status,
  )
    ? `Eval run ${evalStage.status.replaceAll("_", " ")}: ${candidate?.error ?? "no error recorded"}`
    : ["failed", "timed_out", "interrupted"].includes(judgeStage.status)
      ? `Judge ${judgeStage.status.replaceAll("_", " ")}: ${judge?.error ?? "no error recorded"}`
      : judgeStage.score === null
        ? `Unscored: ${judge?.judgment?.reason ?? "the judge returned no decision"}`
        : undefined;
  return {
    id: slot.id,
    evalRunId: candidate?.id,
    judgeRunId: judge?.id,
    model: slot.model.split("#")[0],
    reasoning: slot.model.split("#")[1] ?? "default",
    repetition: slot.repetition,
    status,
    stage,
    startedAt: executing?.startedAt,
    completedAt: executing?.completedAt,
    message: executing?.error,
    eval: evalStage,
    judge: judgeStage,
    attention,
    earlyStop: candidate
      ? !!candidate.input.earlyStop
      : !!benchmark.definition.evals.find((item) => item.id === slot.evalId)
          ?.settings.earlyStop,
    stop: candidate?.stop,
    scheduled: scheduled(slot, benchmark, Date.now()),
  };
}
