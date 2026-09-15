import type { EvalRunIndex, ResultSummary } from "@hona/openeval/view";
import type { ViewerDataSource } from "./types";

/** Share in-flight result reads between the page and drawer within one viewer. */
export function createResultCache(
  source: Pick<ViewerDataSource, "summary" | "runs">,
) {
  const results = new Map<string, ResultSummary | EvalRunIndex>();
  const pending = new Map<string, Promise<ResultSummary | EvalRunIndex>>();
  const load = <T extends ResultSummary | EvalRunIndex>(
    key: string,
    updatedAt: number,
    read: () => Promise<T>,
  ): T | Promise<T> => {
    const cached = results.get(key) as T | undefined;
    if (cached && cached.entry.updatedAt >= updatedAt) return cached;
    const request = pending.get(key) as Promise<T> | undefined;
    if (request) return request;
    const next = read()
      .then((value) => {
        results.delete(key);
        results.set(key, value);
        if (results.size > 8) results.delete(results.keys().next().value!);
        return value;
      })
      .finally(() => pending.delete(key));
    pending.set(key, next);
    return next;
  };
  return {
    summary: (id: string, updatedAt = 0) =>
      load(`summary:${id}`, updatedAt, () => source.summary(id)),
    runs: (id: string, updatedAt = 0) =>
      load(`runs:${id}`, updatedAt, () => source.runs(id)),
  };
}
