import { afterEach, expect, test } from "bun:test";
import { modelName, setModelNames } from "./model";

afterEach(() => setModelNames(undefined));

test("shows the recorded catalog name for every reasoning variant", () => {
  expect(modelName("opencode/claude-fable-5-1#high")).toBe("Claude Fable 5.1");

  setModelNames({ "opencode/claude-opus-5-5": "Claude Opus 5.5" });

  expect(modelName("opencode/claude-opus-5-5#high")).toBe("Claude Opus 5.5");
  expect(modelName("opencode/claude-opus-5-5")).toBe("Claude Opus 5.5");
  expect(modelName("opencode/claude-fable-5-1#high")).toBe("Claude Fable 5.1");
});
