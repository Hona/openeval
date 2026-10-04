import { expect, test } from "bun:test";
import type { CodeJudgeDefinition } from "../../judge-context";
import { fingerprint } from "../files";
import { recordedCodeMatches } from "./code-source";

const source = 'export default () => ({ scores: { works: true } });';
const printer = new Bun.Transpiler({ loader: "js", target: "bun", deadCodeElimination: false });
const current = (text = source): CodeJudgeDefinition => ({ file: "judge.ts", source: text, sourceMap: "",
  dependencies: {}, hash: fingerprint({ protocol: 1, source: printer.transformSync(text) }) });
const recorded = (text = source, dependencies: Record<string, string> = { "/fixture/package.json": '{"name":"fixture"}', "/fixture/bun.lock": "unrelated lock" }): CodeJudgeDefinition => ({
  file: "judge.ts", source: text, sourceMap: "", dependencies, hash: fingerprint({ source: text, dependencies }),
});

test("unchanged standalone code retains a judgment across metadata-only identity changes", () => {
  expect(recordedCodeMatches(current(), recorded())).toBe(true);
  const windows = recorded(source, { "C:\\fixture\\package.json": '{}', "C:\\fixture\\bun.lock": "old lock" });
  expect(recordedCodeMatches(current(), windows)).toBe(true);
});

test("changed executable source remains incompatible", () => {
  expect(recordedCodeMatches(current(), recorded(source.replace("true", "false")))).toBe(false);
});

test("empty or forged identities cannot earn retained credit", () => {
  expect(recordedCodeMatches({ ...current(), source: "" }, { ...recorded(), source: "" })).toBe(false);
  expect(recordedCodeMatches(current(), { ...recorded(), hash: "not-a-recorded-identity" })).toBe(false);
  expect(recordedCodeMatches({ ...current(), hash: "not-current" }, recorded())).toBe(false);
});

test("unknown metadata and external package imports are not ignored", () => {
  const extra = { ...recorded(), dependencies: { "/fixture/executable.js": source } };
  extra.hash = fingerprint({ source: extra.source, dependencies: extra.dependencies });
  expect(recordedCodeMatches(current(), extra)).toBe(false);
  const importing = 'import { check } from "example-package"; export default check;';
  expect(recordedCodeMatches(current(importing), recorded(importing))).toBe(false);
});

test("a changed execution protocol cannot reuse the old identity", () => {
  const next = { ...current(), hash: fingerprint({ protocol: 2, source: printer.transformSync(source) }) };
  expect(recordedCodeMatches(next, recorded())).toBe(false);
});
