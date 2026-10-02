import { afterEach, expect, test } from "bun:test";
import { formatCostTotal, modelName, setModelNames } from "./model";

afterEach(() => setModelNames(undefined));

test("shows the recorded catalog name for every reasoning variant", () => {
  expect(modelName("opencode/claude-fable-5-1#high")).toBe("Claude Fable 5.1");

  setModelNames({ "opencode/claude-opus-5-5": "Claude Opus 5.5" });

  expect(modelName("opencode/claude-opus-5-5#high")).toBe("Claude Opus 5.5");
  expect(modelName("opencode/claude-opus-5-5")).toBe("Claude Opus 5.5");
  expect(modelName("opencode/claude-fable-5-1#high")).toBe("Claude Fable 5.1");
});

test("marks a cost total without every final cost as a lower bound", () => {
  const complete = { usd: 12.5, reportedUSD: 12.5, complete: true, unaccounted: 0 };
  const partial = { usd: null, reportedUSD: 463.339, complete: false, unaccounted: 2 };

  expect(formatCostTotal(complete, false)).toEqual({ label: "$12.50" });
  expect(formatCostTotal(partial, false)).toEqual({
    label: "≥ $463.34",
    note: "Recorded spend. 2 runs have no final cost, so the total can be higher.",
  });
  expect(formatCostTotal({ ...partial, unaccounted: 1 }, false).note).toBe(
    "Recorded spend. 1 run has no final cost, so the total can be higher.",
  );
  expect(formatCostTotal(partial, true)).toEqual({
    label: "$463.34",
    note: "Recorded spend so far. 2 runs have no final cost yet.",
  });
  expect(formatCostTotal(undefined, false)).toEqual({ label: "—" });
});
