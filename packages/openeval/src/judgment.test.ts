import { expect, test } from "bun:test";
import { rubricCriteria } from "./judgment";

test("requires explicit, complete criterion declarations", () => {
  expect(() => rubricCriteria("Pass when the answer is correct.")).toThrow(
    "Declare every criterion",
  );
  expect(() => rubricCriteria("## Criterion: answer")).toThrow(
    "Declare every criterion",
  );
  expect(() =>
    rubricCriteria("## Criterion: answer — Answer\n## Criterion: incomplete"),
  ).toThrow("Declare every criterion");
  expect(() => rubricCriteria("## Criterion: answer —   ")).toThrow(
    "Declare every criterion",
  );
  expect(
    rubricCriteria("## Criterion: answer — Answer\nPass when correct."),
  ).toEqual([{ id: "answer", name: "Answer" }]);
  expect(() => rubricCriteria("## Metric: answer — Answer")).toThrow(
    "Use ## Criterion",
  );
});
