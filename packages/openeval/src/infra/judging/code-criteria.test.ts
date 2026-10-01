import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { readCodeCriteria } from "./code-criteria";

const read = async (source: string) => {
  const root = await mkdtemp(
    resolve(
      process.platform === "win32" ? "C:/tmp/opencode" : tmpdir(),
      "openeval-criteria-",
    ),
  );
  try {
    await Bun.write(resolve(root, "judge.ts"), source);
    return await readCodeCriteria(resolve(root, "judge.ts"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

test("reads the criteria export as data without executing judge.ts", async () => {
  expect(
    await read(`import type { CodeCriteria } from "@hona/openeval";
throw new Error("Do not execute while planning");
// Comments and trailing commas are fine.
export const criteria = {
  correct_answer: { name: 'Correct "answer"', categories: ["general", \`coding\`,] },
  "quoted_id": { categories: [] },
} as const satisfies CodeCriteria;
export default () => ({ scores: {} });`),
  ).toEqual({
    correct_answer: { name: 'Correct "answer"', categories: ["general", "coding"] },
    quoted_id: { categories: [] },
  });
  expect(await read("export default () => ({ scores: {} });")).toBeUndefined();
});

test.each([
  'export const criteria = { a: { categories: [name] } };',
  'export const criteria = { a: { name: `${prefix}` } };',
  'export const criteria = { a: fetch("https://example.com") };',
  'const criteria = {}; export { criteria };',
])("rejects criteria that need execution: %s", async (source) => {
  await expect(read(source)).rejects.toThrow("criteria");
});
