import { expect, test } from "bun:test";
import { verificationInputBytes, verificationInputMiB } from "./limits";

test("default and opted-in archive limits have exact byte counts", () => {
  expect(verificationInputMiB()).toBe(128);
  expect(verificationInputBytes()).toBe(134217728);
  expect(verificationInputBytes(256)).toBe(268435456);
  expect(verificationInputBytes(1)).toBe(1048576);
});

test.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, null, "256", true])("archive limits reject invalid values: %s", value => {
  expect(() => verificationInputMiB(value as number)).toThrow("inputMiB");
});
