import { expect, test } from "bun:test";
import { verificationArgs, verificationPath } from "./session";
import { verificationRuntime } from "./image";
import { verificationInputBytes, verificationInputMiB } from "./limits";

test("verification has no host mounts, credentials, network, or privileged capabilities", () => {
  const args = verificationArgs({ engine: "docker", image: "example", imageId: `sha256:${"a".repeat(64)}`, cpus: 2, memoryMiB: 1024 }, "owner", "container", 1000);
  expect(args).toContain("--network=none");
  expect(args).toContain("--cap-drop=ALL");
  expect(args).toContain("--read-only");
  expect(args).toContain("--pids-limit");
  expect(args).not.toContain("--mount");
  expect(args).not.toContain("--publish");
  expect(args).not.toContain("--privileged");
  expect(args).toContain("openeval.verification-owner=owner");
  expect(args).toContain("/workspace:rw,exec,nosuid,nodev,mode=1777,size=512m");
});

test("a larger verification workspace changes only its bounded tmpfs capacity", () => {
  const runtime = { engine: "docker" as const, image: "example", imageId: `sha256:${"a".repeat(64)}`, cpus: 2, memoryMiB: 4096 };
  const original = verificationArgs(runtime, "owner", "container", 1000);
  const enlarged = verificationArgs({ ...runtime, workspaceMiB: 2048 }, "owner", "container", 1000);
  expect(enlarged).toEqual(original.map(arg => arg.replace("size=512m", "size=2048m")));
});

test.each([0, -1, 1.5, NaN, Infinity, 4097])("invalid workspace capacity is rejected before image inspection: %s", async value => {
  await expect(verificationRuntime({ image: "example", workspaceMiB: value, memoryMiB: 4096 }))
    .rejects.toThrow("workspaceMiB");
});

test("input capacity defaults to the released limit and does not relax container isolation", () => {
  expect(verificationInputMiB()).toBe(128);
  expect(verificationInputBytes()).toBe(128 * 1024 * 1024);
  expect(verificationInputBytes(256)).toBe(256 * 1024 * 1024);
  const runtime = { engine: "docker" as const, image: "example", imageId: `sha256:${"a".repeat(64)}`, cpus: 2, memoryMiB: 4096 };
  expect(verificationArgs({ ...runtime, inputMiB: 256 }, "owner", "container", 1000))
    .toEqual(verificationArgs(runtime, "owner", "container", 1000));
});

test.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])("invalid transfer capacity is rejected before image inspection: %s", async value => {
  expect(() => verificationInputBytes(value)).toThrow("inputMiB");
  await expect(verificationRuntime({ image: "example", inputMiB: value })).rejects.toThrow("inputMiB");
});

test.each(["../host", "/host", "C:/host", "a\\b", "x\0y"])("rejects a path outside verification: %s", value => {
  expect(() => verificationPath(value)).toThrow();
});

test("normalizes contained POSIX paths without interpreting shell characters", () => {
  expect(verificationPath("reports/output.json")).toBe("reports/output.json");
  expect(verificationPath(".")).toBe(".");
  expect(verificationPath("a;echo nope")).toBe("a;echo nope");
});
