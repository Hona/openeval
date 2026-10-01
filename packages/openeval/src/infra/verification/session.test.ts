import { expect, test } from "bun:test";
import { verificationArgs, verificationPath } from "./session";

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
});

test.each(["../host", "/host", "C:/host", "a\\b", "x\0y"])("rejects a path outside verification: %s", value => {
  expect(() => verificationPath(value)).toThrow();
});

test("normalizes contained POSIX paths without interpreting shell characters", () => {
  expect(verificationPath("reports/output.json")).toBe("reports/output.json");
  expect(verificationPath(".")).toBe(".");
  expect(verificationPath("a;echo nope")).toBe("a;echo nope");
});
