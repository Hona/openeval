import { expect, test } from "bun:test";
import { categoryCatalog, modelScore, type ModelScore } from "@hona/openeval/view";
import { leaders, scorecard, scorecardValue } from "./scorecard";

const part = (
  evalId: string,
  criterion: string,
  categories: string[],
  passed: number,
  scored = 3,
): ModelScore["components"][number] => ({
  eval: evalId,
  criterion,
  name: criterion,
  categories,
  value: scored === 3 ? passed / 3 : null,
  scored,
  expected: 3,
  passed,
  scoredSum: passed,
});
const model = (id: string, passes: [number, number, number], scored = 3) =>
  modelScore(id, [
    part("repair", "fixed", ["coding"], passes[0]),
    part("repair", "verified", ["coding", "verification"], passes[1]),
    part("plan", "grounded", ["general"], passes[2], scored),
  ]);
const bounds = (lower: number, upper = lower) => ({ lower, upper, coverage: 100 });

test("puts one benchmark's overall score first, then rescored categories, with models ranked overall", () => {
  const scores = [model("example/low", [1, 1, 1]), model("example/high", [3, 3, 2])];
  const card = scorecard(scores, categoryCatalog(scores[0].components));
  expect(card.models).toEqual(["example/high", "example/low"]);
  expect(card.rows.map((row) => [row.name, row.criteria, row.evals, row.overall])).toEqual([
    ["Overall", 3, 2, true],
    ["coding", 2, 1, false],
    ["verification", 1, 1, false],
    ["general", 1, 1, false],
  ]);
  expect(card.rows[1].cells.map((cell) => scorecardValue(cell.bounds))).toEqual(["100.0%", "33.3%"]);
  expect(card.rows[3].cells.map((cell) => scorecardValue(cell.bounds))).toEqual(["66.7%", "33.3%"]);
  expect(card.rows.every((row) => row.cells[0].leader && !row.cells[1].leader)).toBe(true);
});

test("unresolved checks remain ranges and cannot claim a lead they might lose", () => {
  // One of three plan checks is scored (and passed); two remain unresolved.
  const scores = [model("example/settled", [2, 2, 2]), model("example/pending", [2, 2, 1], 1)];
  const card = scorecard(scores, categoryCatalog(scores[0].components));
  const general = card.rows.find((row) => row.key === "general")!;
  expect(general.cells.map((cell) => scorecardValue(cell.bounds))).toEqual(["66.7%", "33.3–100.0%"]);
  expect(general.cells.map((cell) => cell.leader)).toEqual([false, false]);
});

test("ties share a lead; universal ties and single-model tables mark nothing", () => {
  expect(leaders([bounds(68), bounds(68), bounds(58)])).toEqual([true, true, false]);
  expect(leaders([bounds(70), bounds(70)])).toEqual([false, false]);
  expect(leaders([bounds(90)])).toEqual([false]);
  expect(leaders([bounds(80), bounds(60, 79)])).toEqual([true, false]);
  expect(leaders([bounds(80), bounds(60, 81)])).toEqual([false, false]);
});

test("filtered views can label the overall row for the selected categories", () => {
  const scores = [model("example/only", [3, 3, 3])];
  expect(scorecard(scores, [], "Selected categories").rows.map((row) => row.name)).toEqual(["Selected categories"]);
});
