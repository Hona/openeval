import type { EvidenceRef, ToolCall } from "../../types";
import type {
  RecordedEvent,
  RunMetrics,
  ToolMetrics,
} from "../../judge-context";
import { mergeRuntime, runtimeMs, type RuntimeInterval } from "../../runtime";

const toolsSummary = (tools: ToolCall[]): ToolMetrics => {
  const succeeded = tools.filter((call) => call.status === "succeeded").length;
  const failed = tools.filter((call) => call.status === "failed").length;
  return {
    calls: tools.length,
    succeeded,
    failed,
    unfinished: tools.length - succeeded - failed,
    errorRate: succeeded + failed ? failed / (succeeded + failed) : null,
  };
};

/** Measurements use deduplicated native records, never scored criterion values. */
export function measureRecording(
  supplied: RecordedEvent[],
  tools: ToolCall[],
  evidence: EvidenceRef,
): RunMetrics {
  const events = [
    ...new Map(
      supplied.map((item) => [
        "id" in item.event ? item.event.id : String(item.sequence),
        item.event,
      ]),
    ).values(),
  ].sort(
    (a, b) =>
      ("created" in a ? a.created : 0) - ("created" in b ? b.created : 0),
  );
  const count = (type: string) =>
    events.filter((event) => event.type === type).length;
  const tokens = {
    input: 0,
    output: 0,
    reasoning: 0,
    cache: { read: 0, write: 0 },
  };
  let reportedUSD = 0,
    usageRecords = 0,
    usageComplete = true,
    costComplete = true;
  const intervals: RuntimeInterval[] = [],
    starts = new Map<string, number>();
  const executions: RuntimeInterval[] = [],
    executionStarts = new Map<string, number>();
  const created = new Set<string>();
  const sessions = new Set<string>(),
    sequences = new Map<string, number[]>();
  for (const event of events) {
    if (!("data" in event)) continue;
    const data = event.data as Record<string, unknown>;
    if (typeof data.sessionID === "string") sessions.add(data.sessionID);
    if (event.type === "session.created") created.add(event.data.sessionID);
    if (event.type === "session.execution.started")
      executionStarts.set(event.data.sessionID, event.created);
    if (
      [
        "session.execution.succeeded",
        "session.execution.failed",
        "session.execution.interrupted",
      ].includes(event.type) &&
      typeof data.sessionID === "string" &&
      "created" in event
    ) {
      const start = executionStarts.get(data.sessionID);
      if (start !== undefined) executions.push({ start, end: event.created });
      executionStarts.delete(data.sessionID);
    }
    if ("durable" in event) {
      const values = sequences.get(event.durable.aggregateID) ?? [];
      values.push(event.durable.seq);
      sequences.set(event.durable.aggregateID, values);
    }
    const key = `${data.sessionID}:${data.assistantMessageID ?? "compaction"}`;
    if (
      event.type === "session.step.started" ||
      event.type === "session.compaction.started"
    )
      starts.set(key, event.created);
    if (
      [
        "session.step.ended",
        "session.step.failed",
        "session.compaction.ended",
        "session.compaction.failed",
      ].includes(event.type)
    ) {
      const start = starts.get(key);
      if (start !== undefined && "created" in event)
        intervals.push({ start, end: event.created });
      starts.delete(key);
    }
    if (
      ![
        "session.step.ended",
        "session.step.failed",
        "session.usage.recorded",
      ].includes(event.type)
    )
      continue;
    usageRecords++;
    if (typeof data.cost === "number" && Number.isFinite(data.cost))
      reportedUSD += data.cost;
    else costComplete = false;
    const usage = data.tokens as typeof tokens | undefined;
    if (
      !usage ||
      ![
        usage.input,
        usage.output,
        usage.reasoning,
        usage.cache?.read,
        usage.cache?.write,
      ].every(Number.isFinite)
    ) {
      usageComplete = false;
      continue;
    }
    tokens.input += usage.input;
    tokens.output += usage.output;
    tokens.reasoning += usage.reasoning;
    tokens.cache.read += usage.cache.read;
    tokens.cache.write += usage.cache.write;
  }
  const measuredTokens = usageRecords && usageComplete ? tokens : null;
  const cost = usageRecords && costComplete ? reportedUSD : null;
  const clock = events.reduce(
    (latest, event) =>
      "created" in event ? Math.max(latest, event.created) : latest,
    0,
  );
  const modelActiveMs = runtimeMs(mergeRuntime(intervals), clock);
  const complete =
    sequences.size > 0 &&
    starts.size === 0 &&
    executionStarts.size === 0 &&
    [...sessions].every((id) => created.has(id)) &&
    [...sequences.values()].every((values) => {
      const sorted = [...new Set(values)].sort((a, b) => a - b);
      return sorted.every(
        (value, index) => index === 0 || value === sorted[index - 1] + 1,
      );
    });
  return {
    version: 1,
    scope: "candidate",
    complete,
    sessions: sessions.size,
    requests: {
      started: count("session.step.started"),
      succeeded: count("session.step.ended"),
      failed: count("session.step.failed"),
      retries: count("session.retry.scheduled"),
    },
    tokens: measuredTokens,
    cost: { usd: cost, reportedUSD, complete: cost !== null },
    tools: {
      ...toolsSummary(tools),
      byName: Object.fromEntries(
        [...new Set(tools.map((call) => call.name))]
          .sort()
          .map((name) => [
            name,
            toolsSummary(tools.filter((call) => call.name === name)),
          ]),
      ),
    },
    compactions: {
      started: count("session.compaction.started"),
      completed: count("session.compaction.ended"),
      failed: count("session.compaction.failed"),
    },
    timing: {
      elapsedMs: executions.length
        ? runtimeMs(mergeRuntime(executions), clock)
        : null,
      modelActiveMs,
      outputTokensPerSecond:
        measuredTokens && modelActiveMs > 0
          ? (measuredTokens.output * 1000) / modelActiveMs
          : null,
    },
    evidence,
  };
}
