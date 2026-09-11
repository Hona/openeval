/** Recorded periods of work. An omitted end means the worker is still active. */
export type RuntimeInterval = { start: number; end?: number };

/** Wall-clock runtime is the union of work intervals, not worker-hours or calendar age.
 * Resource/time methodology: https://www.anthropic.com/engineering/infrastructure-noise
 */
export function mergeRuntime(
  intervals: readonly RuntimeInterval[],
): RuntimeInterval[] {
  const sorted = intervals
    .filter(
      (item) =>
        Number.isFinite(item.start) &&
        (item.end === undefined ||
          (Number.isFinite(item.end) && item.end >= item.start)),
    )
    .map((item) => ({ ...item }))
    .sort((a, b) => a.start - b.start);
  const merged: RuntimeInterval[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.start > (previous.end ?? Infinity))
      merged.push(interval);
    else
      previous.end =
        previous.end === undefined || interval.end === undefined
          ? undefined
          : Math.max(previous.end, interval.end);
  }
  return merged;
}

export const runtimeMs = (intervals: readonly RuntimeInterval[], now: number) =>
  mergeRuntime(intervals).reduce(
    (sum, item) =>
      sum + Math.max(0, Math.min(item.end ?? now, now) - item.start),
    0,
  );

export const timestampMs = (value?: string) => {
  const time = value === undefined ? NaN : Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
};

/** Freeze live counters at the last heartbeat when a runner stops reporting. */
export function runtimeClock(
  now: number,
  heartbeat?: string | number,
  running = true,
) {
  const observed =
    typeof heartbeat === "number"
      ? Number.isFinite(heartbeat)
        ? heartbeat
        : undefined
      : timestampMs(heartbeat);
  return observed !== undefined && (!running || now - observed > 30_000)
    ? Math.min(now, observed)
    : now;
}
