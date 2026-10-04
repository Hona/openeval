import { expect, test } from "bun:test";
import type { BenchmarkRun } from "../types";
import { withModelNames } from "./model-name-metadata";

const original = { id: "benchmark_fixture", state: "running", updatedAt: "2026-01-01T00:00:00.000Z",
  definition: { models: ["local/example#high", "local/other#low"] },
  runtime: { imageId: "fixture-image" }, scheduledSlotIds: ["slot_fixture"],
  execution: { spentUSD: 3, budgetUSD: 10 }, modelNames: { "local/example": "example name", "local/other": "Other" },
} as unknown as BenchmarkRun;

test("name refresh changes only display metadata while a runner is active", () => {
  const changed = withModelNames(original, { "local/example": "Example Name" });
  expect(changed.modelNames).toEqual({ "local/example": "Example Name", "local/other": "Other" });
  const { modelNames: _before, ...before } = original;
  const { modelNames: _after, ...after } = changed;
  expect(after).toEqual(before);
  expect(original.modelNames!["local/example"]).toBe("example name");
});

test("unknown models or empty names cannot alter metadata", () => {
  expect(() => withModelNames(original, { "local/unknown": "Unknown" })).toThrow();
  expect(() => withModelNames(original, { "local/example": " " })).toThrow();
});
