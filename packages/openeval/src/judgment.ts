import type { MetricDefinition, MetricJudgment } from "./types";

export const JUDGE_PROTOCOL = 3;
export const isScored = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;

/** Every rubric explicitly declares its metrics. */
export function rubricMetrics(rubric: string): MetricDefinition[] {
  const metrics = [
    ...rubric.matchAll(/^## Metric: ([a-z][a-z0-9_]*)[ \t]*[—–-][ \t]*(.+)$/gm),
  ].map((match) => ({
    id: match[1],
    name: match[2].trim(),
  }));
  if (new Set(metrics.map((metric) => metric.id)).size !== metrics.length)
    throw new Error("Metric IDs must be unique within judge.md");
  if (
    !metrics.length ||
    metrics.some((metric) => !metric.name) ||
    metrics.length !== (rubric.match(/^## Metric:/gm)?.length ?? 0)
  )
    throw new Error(
      "Declare every metric as ## Metric: id — Label in judge.md",
    );
  return metrics;
}

/** Equal weighting within an eval; no task-specific policy is implemented here.
 * https://arxiv.org/html/2607.07946#S5.SS3 (equal task weighting)
 */
export function metricMean(
  metrics: readonly Pick<MetricJudgment, "value">[],
): number | null {
  return metrics.length && metrics.every((metric) => isScored(metric.value))
    ? metrics.reduce((sum, metric) => sum + metric.value!, 0) / metrics.length
    : null;
}
