import type {
  BenchmarkDefinition,
  EvalRun,
  JudgeRun,
  PlanItem,
} from "../types";
import type { Results } from "../infra/sqlite";

export type CostEstimate = {
  candidates: number;
  judges: number;
  estimatedUSD: number | null;
  unknownItems: number;
  items: Array<{ slotId: string; estimatedUSD: number | null }>;
};
const median = (values: number[]) => {
  if (!values.length) return undefined;
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
};

/** Empirical planning estimates, separate from reported spend.
 * https://deepswe.datacurve.ai/blog/deepswe#beyond-pass-rate
 */
export function estimateWork(
  definition: BenchmarkDefinition,
  results: Results,
  plan: readonly PlanItem[],
): CostEstimate {
  const evals = results.evalRuns(),
    judges = results.judgeRuns();
  const cost = (runs: Array<EvalRun | JudgeRun>) =>
    median(
      runs.flatMap((run) => {
        const value = run.session?.accounting?.costUSD;
        return value === undefined ? [] : [value];
      }),
    );
  const ready = plan.filter(
    (item) => item.action === "candidate" || item.action === "judge",
  );
  const items = ready.map((item) => {
    const hasLlm = !!definition.evals.find(
      (evalDefinition) => evalDefinition.id === item.slot.evalId,
    )!.judge;
    const candidate =
      cost(
        evals.filter(
          (run) =>
            run.input.evalId === item.slot.evalId &&
            run.input.model === item.slot.model,
        ),
      ) ??
      cost(evals.filter((run) => run.input.model === item.slot.model)) ??
      cost(evals);
    const judge = !hasLlm
      ? 0
      : (cost(
          judges.filter(
            (run) =>
              run.input.model === definition.judge.model &&
              evals.some(
                (e) =>
                  e.id === run.input.evalRunId &&
                  e.input.evalId === item.slot.evalId,
              ),
          ),
        ) ??
        cost(
          judges.filter((run) => run.input.model === definition.judge.model),
        ) ??
        cost(judges));
    return {
      slotId: item.slot.id,
      estimatedUSD:
        judge === undefined ||
        (item.action === "candidate" && candidate === undefined)
          ? null
          : judge + (item.action === "candidate" ? candidate! : 0),
    };
  });
  return {
    candidates: ready.filter((item) => item.action === "candidate").length,
    judges: ready.length,
    estimatedUSD: items.every((item) => item.estimatedUSD !== null)
      ? items.reduce((sum, item) => sum + item.estimatedUSD!, 0)
      : null,
    unknownItems: items.filter((item) => item.estimatedUSD === null).length,
    items,
  };
}

/** Scheduling guard: active work finishes naturally, so this is not a billing ceiling. */
export class CostBudget {
  private reserved = 0;
  constructor(
    readonly limit: number | undefined,
    private spent: () => number,
  ) {
    if (limit !== undefined && (!Number.isFinite(limit) || limit < 0))
      throw new Error("Cost budget must be a non-negative USD amount");
  }
  reserve(estimate: number | null): (() => void) | undefined {
    if (this.limit === undefined) return () => {};
    if (
      estimate === null ||
      this.spent() + this.reserved + estimate > this.limit
    )
      return;
    this.reserved += estimate;
    let released = false;
    return () => {
      if (!released) {
        this.reserved -= estimate;
        released = true;
      }
    };
  }
}
