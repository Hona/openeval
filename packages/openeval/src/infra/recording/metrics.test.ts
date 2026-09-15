import { expect, test } from "bun:test";
import type { RecordedEvent } from "../../judge-context";
import type { ToolCall } from "../../types";
import { measureRecording } from "./metrics";

const evidence = { directory: "recording", hash: "fixed" };
const usage = (input: number, output: number) => ({
  input,
  output,
  reasoning: 0,
  cache: { read: 0, write: 0 },
});

test("measurements deduplicate native usage, include child work, and merge overlapping requests", () => {
  const records: RecordedEvent[] = [];
  const sequences = new Map<string, number>();
  const add = (
    type: string,
    created: number,
    data: Record<string, unknown>,
  ) => {
    const id = String(data.sessionID),
      seq = sequences.get(id) ?? 0;
    sequences.set(id, seq + 1);
    records.push({
      sequence: records.length,
      time: String(created),
      event: {
        id: `${id}-${seq}`,
        type,
        created,
        data,
        durable: { aggregateID: id, seq, version: 1 },
      } as RecordedEvent["event"],
    });
  };
  add("session.created", 0, { sessionID: "root" });
  add("session.execution.started", 1, { sessionID: "root" });
  add("session.step.started", 10, {
    sessionID: "root",
    assistantMessageID: "a",
  });
  add("session.created", 15, { sessionID: "child", parentID: "root" });
  add("session.execution.started", 16, { sessionID: "child" });
  add("session.step.started", 20, {
    sessionID: "child",
    assistantMessageID: "b",
  });
  add("session.retry.scheduled", 21, {
    sessionID: "child",
    assistantMessageID: "b",
    attempt: 1,
  });
  add("session.step.ended", 30, {
    sessionID: "root",
    assistantMessageID: "a",
    tokens: usage(100, 10),
    cost: 0.1,
  });
  add("session.step.failed", 40, {
    sessionID: "child",
    assistantMessageID: "b",
    tokens: usage(200, 20),
    cost: 0.2,
  });
  add("session.compaction.started", 40, { sessionID: "root" });
  add("session.usage.recorded", 44, {
    sessionID: "root",
    source: "compaction",
    tokens: usage(10, 3),
    cost: 0.03,
  });
  add("session.compaction.ended", 45, { sessionID: "root" });
  add("session.execution.succeeded", 46, { sessionID: "child" });
  add("session.execution.succeeded", 50, { sessionID: "root" });
  const tools: ToolCall[] = [
    {
      id: "one",
      name: "shell",
      assistantMessageId: "a",
      status: "succeeded",
      content: { exitCode: 1 },
    },
    { id: "two", name: "read", assistantMessageId: "b", status: "failed" },
    { id: "three", name: "read", assistantMessageId: "b", status: "called" },
  ];
  const metrics = measureRecording(
    [...records, records[7], records[10]],
    tools,
    evidence,
  );
  expect(metrics.complete).toBe(true);
  expect(metrics.sessions).toBe(2);
  expect(metrics.cost.usd).toBeCloseTo(0.33);
  expect(metrics.tokens).toEqual(usage(310, 33));
  expect(metrics.requests).toEqual({
    started: 2,
    succeeded: 1,
    failed: 1,
    retries: 1,
  });
  expect(metrics.compactions).toEqual({ started: 1, completed: 1, failed: 0 });
  expect(metrics.tools).toMatchObject({
    calls: 3,
    succeeded: 1,
    failed: 1,
    unfinished: 1,
    errorRate: 0.5,
  });
  expect(metrics.tools.byName.shell.errorRate).toBe(0);
  expect(metrics.timing.elapsedMs).toBe(49);
  expect(metrics.timing.modelActiveMs).toBe(35);
  expect(metrics.timing.outputTokensPerSecond).toBeCloseTo((33 * 1000) / 35);
  expect(
    measureRecording(
      records.filter((_, index) => index !== 6),
      tools,
      evidence,
    ).complete,
  ).toBe(false);
});

test("absent usage and zero terminal tools stay unavailable rather than becoming perfect metrics", () => {
  const metrics = measureRecording([], [], evidence);
  expect(metrics.complete).toBe(false);
  expect(metrics.tokens).toBeNull();
  expect(metrics.cost).toEqual({ usd: null, reportedUSD: 0, complete: false });
  expect(metrics.tools.errorRate).toBeNull();
  expect(metrics.timing.outputTokensPerSecond).toBeNull();
});
