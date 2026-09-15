import { expect, test } from "bun:test";
import { modelScore } from "./view";

const part = (evalId: string, criterion: string, value: number | null) => ({
  eval: evalId,
  criterion,
  name: criterion,
  value,
  expected: 1,
  scored: value === null ? 0 : 1,
  passed: value === 1 ? 1 : 0,
  scoredSum: value ?? 0,
});

test("fractional criterion scores keep equal eval weights", () => {
  const score = modelScore("model", [
    part("two", "a", 1),
    part("two", "b", 0.5),
    part("one", "c", 0.5),
  ]);
  expect(score.percentage).toBe(62.5);
  expect(score.maximum).toBe(2);
});

test("an eval without criterion scores cannot disappear from the denominator", () => {
  const score = modelScore(
    "model",
    [part("scored", "a", 1)],
    ["scored", "unscored"],
  );
  expect(score.percentage).toBeNull();
  expect(score.maximum).toBe(2);
  expect(score.unscoredEvals).toEqual(["unscored"]);
  expect(score.bounds).toEqual({ lower: 50, upper: 100, coverage: 50 });
});

test("pending code grading cannot expose a completed Markdown-only percentage", () => {
  const score = modelScore(
    "model",
    [part("hybrid", "reviewed", 1)],
    ["hybrid"],
    ["hybrid"],
  );
  expect(score.percentage).toBeNull();
  expect(score.bounds).toEqual({ lower: 0, upper: 100, coverage: 0 });
});
