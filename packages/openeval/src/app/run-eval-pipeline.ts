import { relative, resolve } from "node:path";
import type {
  EvalRun,
  JudgeRun,
  JudgeCheck,
  Judgment,
  EarlyDecision,
  EvidenceCheckpoint,
  Slot,
} from "../types";
import type { EvidenceView } from "../evidence";
import type { ExecutionContext } from "./context";
import { runEval } from "./run-eval";
import { judgeEvalRun } from "./judge-run";
import { canJudgeEval } from "./eval-state";
import { watchEvidence } from "./watch-evidence";
import { ExecutionBudget } from "./execution-budget";
import { CandidateEvidence } from "../infra/evidence";
import { createJudgeSession } from "../infra/judging/observer";
import { errorMessage } from "../infra/files";
import { JUDGE_PROTOCOL } from "../judgment";
import { JUDGE_AGENT } from "../infra/judging/agent";
import { monitorPolicy } from "./monitor-policy";
import { executionRuntime } from "./execution-runtime";
import { runtimeMs } from "../runtime";

/** Own the coordination; neither the evidence reader nor the judge can control execution. */
export async function runEvalPipeline(
  context: ExecutionContext,
  slot: Slot,
  workspace: string,
  budget: ExecutionBudget,
): Promise<EvalRun> {
  const definition = context.definition.evals.find(
    (item) => item.id === slot.evalId,
  )!;
  const policy = context.finalOnly
    ? undefined
    : monitorPolicy(definition.settings.earlyStop, slot.model);
  if (!policy) {
    const run = await budget.run("eval", () =>
      runEval(context, slot, workspace),
    );
    if (canJudgeEval(run))
      await budget.run("judge", () => judgeEvalRun(context, run));
    return run;
  }
  const release = budget.monitor();
  const stopEval = new AbortController(),
    stopWatching = new AbortController();
  let watching: Promise<void> = Promise.resolve();
  let judgeRun: JudgeRun | undefined, candidate: EvalRun | undefined;
  let observer: Awaited<ReturnType<typeof createJudgeSession>> | undefined,
    archived = false;
  let decisive: { judgment: Judgment; check: JudgeCheck } | undefined,
    lastCheck: JudgeCheck | undefined;
  let monitorError: string | undefined, monitorErrorAt: string | undefined;
  let monitorLimit: string | undefined;
  const checkpoint = (view: EvidenceView): EvidenceCheckpoint => ({
    ...view.checkpoint,
    directory: relative(context.directory, view.checkpoint.directory),
  });
  const ensureRun = (view: EvidenceView) => {
    const saved = checkpoint(view);
    context.results.saveCheckpoint(candidate!.id, saved);
    judgeRun ??= context.results.startJudge({
      evalRunId: candidate!.id,
      evidence: saved,
      rubric: definition.judge,
      kind: "llm",
      agent: JUDGE_AGENT,
      model: context.definition.judge.model,
      judgeHash: slot.judgeHash,
      timeoutMs: context.definition.judge.timeoutMs,
      websearch: context.definition.judge.websearch,
      mode: "monitor",
      runtimeHash: context.runtime.judgeHash,
      protocol: JUDGE_PROTOCOL,
      criteria: definition.criteria,
      monitor: policy,
    });
    return saved;
  };
  const ensureObserver = async () =>
    (observer ??= await createJudgeSession(
      judgeRun!.input,
      resolve(context.directory, "judge-runs", judgeRun!.id),
      (event) => {
        const record = {
          executionId: judgeRun!.id,
          stage: "judge" as const,
          time: new Date().toISOString(),
          event,
        };
        context.results.append(record);
        context.onEvent?.(record);
      },
    ));
  const check = async (
    view: EvidenceView,
    signal: AbortSignal,
    purpose: JudgeCheck["purpose"],
  ): Promise<NonNullable<JudgeCheck["decision"]>> => {
    const saved = ensureRun(view);
    let started = context.results.startJudgeCheck(judgeRun!.id, purpose, saved);
    context.results.judgeActivity(judgeRun!.id, "queued");
    try {
      const decision = await budget.run(
        "judge",
        async () => {
          signal.throwIfAborted();
          started = context.results.startJudgeCheckExecution(
            judgeRun!.id,
            started.id,
          );
          context.results.judgeActivity(judgeRun!.id, "checking");
          const session = await ensureObserver();
          session.setCheck(started.id);
          return purpose === "early"
            ? session.check(view, signal)
            : {
                kind: "decided" as const,
                judgment: await session.grade(view, signal),
              };
        },
        signal,
      );
      lastCheck = {
        ...started,
        state: "completed",
        decision,
        completedAt: new Date().toISOString(),
        events: {
          ...started.events,
          through: context.results.lastEvent(judgeRun!.id),
        },
      };
      context.results.finishJudgeCheck(lastCheck);
      return decision;
    } catch (error) {
      context.results.finishJudgeCheck({
        ...started,
        state: signal.aborted ? "cancelled" : "failed",
        error: signal.aborted
          ? "Eval execution ended while this check was pending"
          : errorMessage(error),
        completedAt: new Date().toISOString(),
        events: {
          ...started.events,
          through: context.results.lastEvent(judgeRun!.id),
        },
      });
      throw error;
    } finally {
      context.results.judgeActivity(judgeRun!.id, "watching");
    }
  };
  const finalize = async (judgment?: Judgment, error?: string) => {
    if (!judgeRun) return;
    let session: JudgeRun["session"];
    if (observer && !archived) {
      archived = true;
      try {
        const saved = await budget.run("judge", async () => {
          context.results.judgeActivity(judgeRun!.id, "finalizing");
          return observer!.close();
        });
        if (saved)
          session = {
            ...saved,
            database: relative(
              context.directory,
              resolve(
                context.directory,
                "judge-runs",
                judgeRun.id,
                saved.database,
              ),
            ),
          };
      } catch (cause) {
        error = errorMessage(cause);
      }
    }
    const completed: JudgeRun = {
      ...context.results.judgeRun(judgeRun.id)!,
      input: {
        ...judgeRun.input,
        evidence: candidate?.evidence ?? judgeRun.input.evidence,
      },
      state: error || !judgment ? "failed" : "completed",
      judgment: error ? undefined : judgment,
      error,
      session,
      activity: undefined,
      decisionCheckId:
        decisive?.check.id ??
        (lastCheck?.decision?.kind === "decided" ? lastCheck.id : undefined),
      monitorError,
      monitorErrorAt,
      monitorLimit,
      completedAt: new Date().toISOString(),
    };
    completed.elapsedMs = runtimeMs(
      executionRuntime(
        completed,
        context.results,
        context.results.benchmark!,
        Date.now(),
      ),
      Date.now(),
    );
    context.results.finishJudge(completed);
  };
  try {
    candidate = await budget.run("eval", () =>
      runEval(context, slot, workspace, {
        signal: stopEval.signal,
        onEvidence: (run, feed) => {
          candidate = run;
          watching = watchEvidence(
            feed,
            (view, signal) =>
              check(view, signal, "early") as Promise<EarlyDecision>,
            stopWatching.signal,
            {
              ...policy,
              canCheck: () =>
                (judgeRun
                  ? (context.results.recordedCost(judgeRun.id) ?? 0)
                  : 0) < policy.maxCostUSD,
              onLimit: (reason) => {
                monitorLimit = reason;
                if (judgeRun)
                  context.results.judgeActivity(
                    judgeRun.id,
                    "watching",
                    undefined,
                    undefined,
                    reason,
                  );
                release();
              },
            },
          )
            .then((result) => {
              if (!result || !lastCheck || !judgeRun) return;
              decisive = {
                judgment: result.decision.judgment,
                check: lastCheck,
              };
              if (context.results.evalRun(run.id)?.state === "running") {
                context.results.requestEvalStop(run.id, {
                  reason: "judge_decided",
                  requestedAt: new Date().toISOString(),
                  judgeRunId: judgeRun.id,
                  checkId: lastCheck.id,
                  checkpoint: lastCheck.checkpoint,
                });
                stopEval.abort();
              }
            })
            .catch((error) => {
              if (stopWatching.signal.aborted) return;
              monitorError = errorMessage(error);
              monitorErrorAt = new Date().toISOString();
              if (judgeRun)
                context.results.judgeActivity(
                  judgeRun.id,
                  "watching",
                  monitorError,
                  monitorErrorAt,
                );
            });
        },
      }),
    );
    stopWatching.abort();
    await watching;
    if (!canJudgeEval(candidate)) {
      await finalize(
        undefined,
        "Eval execution did not finalize judgeable evidence",
      );
      return candidate;
    }
    if (decisive) await finalize(decisive.judgment);
    else if (monitorError && !observer) {
      // A failed observer setup cannot be reused. Keep its audit and use the normal final judge.
      await finalize(undefined, monitorError);
      await budget.run("judge", () =>
        judgeEvalRun(
          context,
          candidate!,
          judgeRun ? {} : { monitorError, monitorErrorAt },
        ),
      );
    } else {
      const reference = {
        ...candidate.evidence,
        directory: resolve(context.directory, candidate.evidence.directory),
      };
      const view = (
        await CandidateEvidence.open(reference.directory, reference.hash)
      ).view(reference);
      try {
        const decision = await check(
          view,
          new AbortController().signal,
          "final",
        );
        await finalize(
          decision.kind === "decided" ? decision.judgment : undefined,
        );
      } catch (error) {
        await finalize(undefined, errorMessage(error));
      }
    }
    return candidate;
  } catch (error) {
    stopWatching.abort();
    await watching;
    if (judgeRun && context.results.judgeRun(judgeRun.id)?.state === "running")
      await finalize(undefined, errorMessage(error));
    throw error;
  } finally {
    stopWatching.abort();
    try {
      await watching;
    } finally {
      release();
    }
  }
}
