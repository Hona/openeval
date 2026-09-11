import { expect, test } from "bun:test";
import { rubricMetrics } from "./judgment";

test("requires explicit, complete metric declarations", () => {
  expect(() => rubricMetrics("Pass when the answer is correct.")).toThrow(
    "Declare every metric",
  );
  expect(() => rubricMetrics("## Metric: answer")).toThrow(
    "Declare every metric",
  );
  expect(() =>
    rubricMetrics("## Metric: answer — Answer\n## Metric: incomplete"),
  ).toThrow("Declare every metric");
  expect(() => rubricMetrics("## Metric: answer —   ")).toThrow(
    "Declare every metric",
  );
  expect(
    rubricMetrics("## Metric: answer — Answer\nPass when correct."),
  ).toEqual([{ id: "answer", name: "Answer" }]);
});
