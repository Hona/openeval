import { expect, test } from "bun:test";
import { categoryList, rubricCategories } from "./criterion-categories";
import { categoryCatalog, modelScore, selectCategories } from "./view";

const rubric = [
  "# Example",
  "",
  "## Criterion: asks — Asks for the version",
  "Return 1 when it asks.",
  "",
  "## Criterion: correct — Correct moves",
  "Return 1 when every move is obtainable.",
].join("\n");
const categorized = rubric
  .replace(
    "## Criterion: asks — Asks for the version\n",
    "## Criterion: asks — Asks for the version\nCategories: General, misalignment\n",
  )
  .replace(
    "## Criterion: correct — Correct moves\n",
    "## Criterion: correct — Correct moves\ncategory: general\n",
  );

test("category lines are metadata that leave the judge rubric unchanged", () => {
  expect(rubricCategories(categorized)).toEqual({
    rubric,
    categories: { asks: ["General", "misalignment"], correct: ["general"] },
  });
  const crlf = categorized.replaceAll("\n", "\r\n");
  expect(rubricCategories(crlf).rubric).toBe(rubric.replaceAll("\n", "\r\n"));
  expect(rubricCategories(rubric)).toEqual({ rubric, categories: {} });
});

test("category lines must sit directly below a heading and name something", () => {
  expect(() =>
    rubricCategories(
      rubric.replace(
        "Return 1 when it asks.",
        "Return 1 when it asks.\nCategories: general",
      ),
    ),
  ).toThrow("directly below");
  expect(() =>
    rubricCategories(
      rubric.replace(
        "Asks for the version\n",
        "Asks for the version\nCategories: general, \n",
      ),
    ),
  ).toThrow("non-empty");
  expect(categoryList([" Coding ", "coding", "General"], "test")).toEqual([
    "Coding",
    "General",
  ]);
});

test("category scores rescore only matching criteria with equal eval weights", () => {
  const part = (
    eval_: string,
    criterion: string,
    value: number | null,
    categories?: string[],
  ) => ({
    eval: eval_,
    criterion,
    name: criterion,
    ...(categories ? { categories } : {}),
    value,
    scored: value === null ? 0 : 1,
    expected: 1,
    passed: value === 1 ? 1 : 0,
    scoredSum: value ?? 0,
  });
  const score = modelScore(
    "local/model",
    [
      part("a", "one", 1, ["Coding"]),
      part("a", "two", 0, ["verification"]),
      part("b", "three", 0, ["coding"]),
      part("c", "four", null, ["Coding", "general"]),
      part("d", "five", 1),
    ],
    ["a", "b", "c", "d"],
    ["c"],
  );

  expect(selectCategories(score, ["verification"]).percentage).toBe(0);
  const coding = selectCategories(score, ["coding"]);
  expect(coding.percentage).toBeNull();
  expect(coding.unscoredEvals).toEqual(["c"]);
  expect(coding.bounds).toEqual({
    lower: 100 / 3,
    upper: 200 / 3,
    coverage: 200 / 3,
  });
  expect(categoryCatalog(score.components)).toEqual([
    { key: "coding", name: "Coding", criteria: 3, evals: 3 },
    { key: "verification", name: "verification", criteria: 1, evals: 1 },
    { key: "general", name: "general", criteria: 1, evals: 1 },
  ]);
});
