import { randomUUID } from "node:crypto";
import { mkdir, rm, lstat } from "node:fs/promises";
import { resolve, dirname, posix } from "node:path";
import type { VerificationRequest, VerificationResult, VerificationRuntime } from "../../judge-context";
import type { Engine } from "../../types";
import { engineCommand } from "../containers/docker";
import { extractWorkspaceArchive } from "../containers/transfer";
import { contained, hash, relativePath, writeJson } from "../files";

const LOG_BYTES = 1024 * 1024;
const OUTPUT_BYTES = 32 * 1024 * 1024;
const INPUT_BYTES = 128 * 1024 * 1024;

export function verificationPath(value: string): string {
  relativePath(value, "Verification path");
  if (value.includes("\\") || value.includes("\0") || value.startsWith("/") || /^[a-z]:/i.test(value))
    throw new Error("Verification paths must use contained POSIX-relative paths");
  return posix.normalize(value);
}

/** No host mounts, credentials, published ports, network, or elevated capabilities. */
export function verificationArgs(runtime: VerificationRuntime, owner: string, name: string, timeoutMs: number) {
  return [
    "run", "--detach", "--rm", "--init", "--name", name,
    "--label", `openeval.verification-owner=${owner}`,
    "--network=none", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--read-only",
    "--pids-limit", "128", "--cpus", String(runtime.cpus), "--memory", `${runtime.memoryMiB}m`,
    "--memory-swap", `${runtime.memoryMiB}m`, "--user", "10001:10001",
    "--tmpfs", "/workspace:rw,exec,nosuid,nodev,mode=1777,size=512m",
    "--tmpfs", "/verification:rw,exec,nosuid,nodev,mode=0755,size=64m",
    "--tmpfs", "/tmp:rw,exec,nosuid,nodev,mode=1777,size=256m",
    "--env", "HOME=/tmp/home", "--env", "CI=1",
    "--entrypoint", "timeout", runtime.imageId,
    "--signal=TERM", "--kill-after=5s", `${Math.ceil(timeoutMs / 1000)}s`, "sleep", "infinity",
  ];
}

async function bounded(stream: ReadableStream<Uint8Array>, limit: number, overflow?: () => void) {
  const chunks: Uint8Array[] = [];
  let bytes = 0, truncated = false;
  for await (const chunk of stream) {
    const room = Math.max(0, limit - bytes);
    if (room) chunks.push(chunk.slice(0, room));
    bytes += Math.min(room, chunk.length);
    if (chunk.length > room) {
      truncated = true;
      overflow?.();
    }
  }
  return { bytes: Buffer.concat(chunks), truncated };
}

/** Remove only containers owned by this code-judge execution, including after worker death. */
export async function closeVerification(engine: Engine, owner: string) {
  const names = await engineCommand(engine, ["ps", "-aq", "--filter", `label=openeval.verification-owner=${owner}`]);
  if (names.trim()) await engineCommand(engine, ["rm", "--force", ...names.split(/\s+/)]);
}

export function verificationSession(options: {
  environment?: VerificationRuntime;
  directory: string;
  owner: string;
  deadlineAt: number;
  materialize: (revision: "initial" | "final") => Promise<string>;
}) {
  const results: VerificationResult[] = [];
  const outputs = new Map<string, VerificationResult>();
  const read = async (result: VerificationResult, path: string) => {
    const retained = outputs.get(result.id);
    if (!retained) throw new Error("Read outputs from a verification produced by this context");
    const artifact = retained.artifacts.find(item => item.path === path);
    if (!artifact) throw new Error(`Verification did not retain ${path}`);
    const bytes = await Bun.file(contained(options.directory, artifact.file)).bytes();
    if (hash(bytes) !== artifact.sha256) throw new Error("Verification artifact hash mismatch");
    return bytes;
  };
  return {
    results,
    context: {
      read,
      async text(result: VerificationResult, path: string) {
        return new TextDecoder("utf-8", { fatal: true }).decode(await read(result, path));
      },
      async run(request: VerificationRequest): Promise<VerificationResult> {
        const runtime = options.environment;
        if (!runtime) throw new Error("Set judge.verification and build its image before verifying artifacts");
        if (!Array.isArray(request.commands) || !request.commands.length || request.commands.some(argv =>
          !Array.isArray(argv) || !argv.length || argv.some(arg => typeof arg !== "string" || !arg || arg.includes("\0"))))
          throw new Error("Verification requires non-empty command argv arrays");
        const requested = request.timeoutMs ?? 120_000;
        if (!Number.isSafeInteger(requested) || requested < 1) throw new Error("Verification timeout must be a positive integer");
        const timeoutMs = Math.min(requested, options.deadlineAt - Date.now());
        if (timeoutMs <= 0) throw new Error("Code-judge deadline was reached before verification");
        const cwd = verificationPath(request.cwd ?? ".");
        const artifacts = (request.artifacts ?? []).map(verificationPath);
        const revision = request.revision ?? "final";
        if (revision !== "initial" && revision !== "final") throw new Error("Unknown verification revision");
        const id = `verification_${randomUUID()}`;
        const directory = resolve(options.directory, "verification", id);
        const staging = resolve(directory, ".transfer");
        const trusted = resolve(staging, "trusted");
        await mkdir(trusted, { recursive: true });
        let trustedBytes = 0;
        for (const [path, content] of Object.entries(request.files ?? {})) {
          if (typeof content !== "string") throw new Error("Verification file contents must be text");
          trustedBytes += Buffer.byteLength(content);
          if (trustedBytes > OUTPUT_BYTES) throw new Error("Trusted verification inputs exceed 32 MiB");
          const target = contained(trusted, verificationPath(path));
          await mkdir(dirname(target), { recursive: true });
          await Bun.write(target, content);
        }
        const workspace = await options.materialize(revision);
        const archive = resolve(staging, "workspace.tar");
        const pack = Bun.spawn(["tar", "-cf", archive, "-C", workspace, "."], { stdout: "ignore", stderr: "pipe" });
        const [packed, packError] = await Promise.all([pack.exited, new Response(pack.stderr).text()]);
        if (packed || (await lstat(archive)).size > INPUT_BYTES)
          throw new Error(packed ? `Verification transfer failed: ${packError}` : "Restored verification workspace exceeds 128 MiB");
        const name = `openeval-verify-${randomUUID()}`;
        const startedAt = new Date().toISOString();
        const deadlineAt = Date.now() + timeoutMs;
        const commands: VerificationResult["commands"] = [];
        let stdout = "", stderr = "", logsTruncated = false, timedOut = false, exitCode: number | null = null;
        const result: VerificationResult = {
          id, state: "completed", revision, environment: runtime, startedAt, elapsedMs: 0,
          commands, exitCode, stdout: "", stderr: "", logsTruncated: false, artifacts: [], missingArtifacts: [],
        };
        try {
          await engineCommand(runtime.engine, verificationArgs(runtime, options.owner, name, timeoutMs));
          await engineCommand(runtime.engine, ["exec", "--interactive", "--user", "10001:10001", name,
            "tar", "--no-same-owner", "--no-overwrite-dir", "-xf", "-", "-C", "/workspace"], { input: archive, timeoutMs });
          await engineCommand(runtime.engine, ["cp", `${trusted}/.`, `${name}:/verification`], { timeoutMs });
          for (const argv of request.commands) {
            const started = Date.now();
            const remaining = deadlineAt - started;
            if (remaining <= 0) { timedOut = true; break; }
            const child = Bun.spawn([runtime.engine, "exec", "--user", "10001:10001", "--workdir",
              posix.join("/workspace", cwd), name, ...argv], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
            const timer = setTimeout(() => { timedOut = true; child.kill(); }, remaining);
            try {
              const [code, out, err] = await Promise.all([child.exited, bounded(child.stdout, LOG_BYTES), bounded(child.stderr, LOG_BYTES)]);
              exitCode = timedOut ? null : code;
              commands.push({ argv: [...argv], exitCode, elapsedMs: Date.now() - started });
              stdout += out.bytes.toString("utf8"); stderr += err.bytes.toString("utf8");
              logsTruncated ||= out.truncated || err.truncated;
              if (timedOut || code !== 0) break;
            } finally { clearTimeout(timer); }
          }
          if (!timedOut) for (const path of artifacts) {
            const tar = resolve(staging, `output-${randomUUID()}.tar`);
            const child = Bun.spawn([runtime.engine, "cp", `${name}:/workspace/${path}`, "-"], { stdout: "pipe", stderr: "pipe" });
            const timer = setTimeout(() => child.kill(), 30_000);
            const [code, output, error] = await Promise.all([child.exited, bounded(child.stdout, OUTPUT_BYTES, () => child.kill()), bounded(child.stderr, LOG_BYTES)]).finally(() => clearTimeout(timer));
            if (output.truncated) throw new Error("Verification output exceeds 32 MiB");
            if (code !== 0) {
              if (/not found|no such file|could not find/i.test(error.bytes.toString())) { result.missingArtifacts.push(path); continue; }
              throw new Error(`Cannot retain verification output: ${error.bytes.toString()}`);
            }
            await Bun.write(tar, output.bytes);
            const extracted = resolve(staging, `output-${randomUUID()}`);
            await mkdir(extracted);
            await extractWorkspaceArchive(tar, extracted, { sourceRoot: "/workspace" });
            const file = contained(extracted, posix.basename(path));
            if (!(await lstat(file)).isFile()) throw new Error("Verification artifacts must be regular files, not links or directories");
            const bytes = await Bun.file(file).bytes();
            const relative = `verification/${id}/artifacts/${path}`;
            const target = contained(options.directory, relative);
            await mkdir(dirname(target), { recursive: true });
            await Bun.write(target, bytes);
            result.artifacts.push({ path, bytes: bytes.length, sha256: hash(bytes), file: relative });
          }
          Object.assign(result, { state: timedOut ? "timed_out" : "completed", elapsedMs: Date.now() - Date.parse(startedAt), exitCode, logsTruncated });
          result.stdout = `verification/${id}/stdout.log`; result.stderr = `verification/${id}/stderr.log`;
          await Bun.write(resolve(directory, "stdout.log"), stdout.slice(0, LOG_BYTES));
          await Bun.write(resolve(directory, "stderr.log"), stderr.slice(0, LOG_BYTES));
          result.logsTruncated ||= stdout.length > LOG_BYTES || stderr.length > LOG_BYTES;
          await writeJson(resolve(directory, "receipt.json"), result);
          outputs.set(id, result); results.push(result);
          return structuredClone(result);
        } finally {
          await engineCommand(runtime.engine, ["rm", "--force", name]).catch(() => {});
          await rm(staging, { recursive: true, force: true });
        }
      },
    },
  };
}
