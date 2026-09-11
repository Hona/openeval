import { mkdir, rm, stat } from "node:fs/promises";
import { resolve, posix, basename, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  CANDIDATE_TIMEOUT_MS,
  type BenchmarkDefinition,
  type PreparationStep,
} from "../../types";
import { engineCommand } from "./docker";
import { extractWorkspaceArchive } from "./transfer";
import { treeHash, fingerprint, writeJson } from "../files";
import { OPENCODE_VERSION } from "../opencode/host";
import { judgingFingerprint } from "../judging";

const runtimeDirectory = fileURLToPath(new URL("./runtime/", import.meta.url));
export async function buildImage(config: BenchmarkDefinition["container"]) {
  const source = await treeHash(runtimeDirectory);
  await engineCommand(
    config.engine,
    [
      "build",
      "--label",
      `openeval.runtime=${source}`,
      "-t",
      config.image,
      runtimeDirectory,
    ],
    { timeoutMs: 600_000 },
  );
}
export async function inspectImage(config: BenchmarkDefinition["container"]) {
  const inspected = await engineCommand(config.engine, [
    "image",
    "inspect",
    config.image,
    "--format",
    '{{.Id}}|{{index .Config.Labels "openeval.runtime"}}',
  ]);
  const [id, source] = inspected.split("|");
  if (source !== (await treeHash(runtimeDirectory)))
    throw new Error(
      "Candidate runtime changed or the image is not initialized. Run the image command first.",
    );
  return id;
}
export async function runtimeFingerprint(
  config: BenchmarkDefinition["container"],
) {
  const imageId = await inspectImage(config);
  return {
    imageId,
    candidateHash: fingerprint({
      imageId,
      sdk: OPENCODE_VERSION,
      engine: config.engine,
      cpus: config.cpus,
      memoryMiB: config.memoryMiB,
      implementation: await treeHash(resolve(runtimeDirectory, ".."), {
        ignore: /\.test\.[jt]sx?$/,
      }),
      sessions: await treeHash(
        fileURLToPath(new URL("../opencode/", import.meta.url)),
        { ignore: /\.test\.[jt]sx?$/ },
      ),
      evidence: await treeHash(
        fileURLToPath(new URL("../evidence/", import.meta.url)),
      ),
      useCases: await Promise.all(
        [
          "run-eval.ts",
          "run-eval-pipeline.ts",
          "watch-evidence.ts",
          "execution-budget.ts",
        ].map((file) =>
          Bun.file(
            fileURLToPath(new URL(`../../app/${file}`, import.meta.url)),
          ).text(),
        ),
      ),
    }),
    judgeHash: await judgingFingerprint(),
  };
}

/** A private workspace and a normal OpenCode installation; no evaluator inputs or code. */
export class CandidateContainer {
  readonly name = `workspace-${randomUUID()}`;
  readonly password = randomUUID();
  deadlineAt?: number;
  private workspaceVolume = `${this.name}-files`;
  private homeVolume = `${this.name}-home`;
  private stopped = false;
  private removed = false;
  private constructor(
    private config: BenchmarkDefinition["container"],
    readonly imageId: string,
  ) {}
  private command(
    args: string[],
    options?: Parameters<typeof engineCommand>[2],
  ) {
    return engineCommand(this.config.engine, args, options);
  }

  static async create(
    config: BenchmarkDefinition["container"],
    imageId: string,
  ) {
    const container = new CandidateContainer(config, imageId);
    try {
      for (const volume of [container.workspaceVolume, container.homeVolume])
        await container.command(["volume", "create", volume]);
      await container.command([
        "run",
        "--detach",
        "--init",
        "--name",
        container.name,
        "--hostname",
        "workstation",
        "--cap-drop=ALL",
        "--cap-add=NET_ADMIN",
        "--cap-add=SETUID",
        "--cap-add=SETGID",
        "--cap-add=SETPCAP",
        "--security-opt=no-new-privileges",
        "--pids-limit",
        "256",
        "--cpus",
        String(config.cpus),
        "--memory",
        `${config.memoryMiB}m`,
        "--publish",
        "127.0.0.1::4096",
        "--mount",
        `type=volume,source=${container.workspaceVolume},target=/workspace`,
        "--mount",
        `type=volume,source=${container.homeVolume},target=/home/dev`,
        imageId,
      ]);
      return container;
    } catch (error) {
      await container.close();
      throw error;
    }
  }
  async prepare(
    workspace: string,
    database: string,
    websearch: "exa" | false,
    steps: readonly PreparationStep[],
    staging: string,
    providers?: BenchmarkDefinition["candidate"]["providers"],
  ) {
    await this.upload(workspace, "/workspace", staging);
    await this.upload(database, "/home/dev/.local/share/opencode", staging);
    const config = resolve(staging, "opencode.json");
    await writeJson(config, {
      plugins: ["/opt/opencode/noninteractive"],
      permissions: [{ action: "*", resource: "*", effect: "allow" }],
      websearch: websearch ? { provider: websearch } : false,
      ...(providers ? { providers } : {}),
    });
    await this.upload(config, "/home/dev/.config/opencode", staging);
    for (const step of steps) {
      const workdir = posix.resolve(
        "/workspace",
        step.cwd.replaceAll("\\", "/"),
      );
      if (workdir !== "/workspace" && !workdir.startsWith("/workspace/"))
        throw new Error("Preparation directory escapes the workspace");
      await this.command(
        [
          "exec",
          "--user",
          "dev",
          "--workdir",
          workdir,
          this.name,
          ...step.argv,
        ],
        { timeoutMs: 180_000 },
      );
    }
  }
  private async upload(source: string, destination: string, staging: string) {
    const directory = (await stat(source)).isDirectory();
    const archive = resolve(staging, `transfer-${randomUUID()}.tar`);
    try {
      const child = Bun.spawn(
        [
          "tar",
          "-cf",
          archive,
          "-C",
          directory ? source : dirname(source),
          directory ? "." : basename(source),
        ],
        { stdout: "ignore", stderr: "pipe" },
      );
      const [code, error] = await Promise.all([
        child.exited,
        new Response(child.stderr).text(),
      ]);
      if (code !== 0) throw new Error(`Workspace transfer failed: ${error}`);
      await this.command(
        [
          "exec",
          "--user",
          "dev",
          "--interactive",
          this.name,
          "tar",
          "--no-same-owner",
          "-xf",
          "-",
          "-C",
          destination,
        ],
        { input: archive },
      );
    } finally {
      await rm(archive, { force: true });
    }
  }
  async start(timeoutMs = CANDIDATE_TIMEOUT_MS) {
    // The server deadline survives a host runner crash.
    this.deadlineAt = Date.now() + Math.ceil(timeoutMs / 1000) * 1000;
    await this.command([
      "exec",
      "--user",
      "dev",
      "--detach",
      "--env",
      `OPENCODE_SERVER_PASSWORD=${this.password}`,
      this.name,
      "sh",
      "-c",
      `exec timeout --signal=TERM --kill-after=5s ${Math.ceil(timeoutMs / 1000)}s bun /opt/opencode/server.mjs > /home/dev/.local/share/opencode/server.log 2>&1`,
    ]);
    const port = await this.command(["port", this.name, "4096/tcp"]);
    const url = `http://${port.split(/\r?\n/)[0]}`;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        if (
          (
            await fetch(`${url}/api/health`, {
              headers: {
                authorization: `Basic ${Buffer.from(`opencode:${this.password}`).toString("base64")}`,
              },
              signal: AbortSignal.timeout(1000),
            })
          ).ok
        )
          return url;
      } catch {}
      await Bun.sleep(100);
    }
    const log = await this.inspect([
      "tail",
      "-n",
      "40",
      "/home/dev/.local/share/opencode/server.log",
    ]);
    throw new Error(`OpenCode server did not become ready: ${log}`);
  }
  async snapshot(destination: string, staging: string) {
    await mkdir(destination, { recursive: true });
    const archive = resolve(staging, `files-${randomUUID()}.tar`);
    try {
      await this.command(
        [
          "run",
          "--rm",
          "--user",
          "dev",
          "--entrypoint",
          "tar",
          "--mount",
          `type=volume,source=${this.workspaceVolume},target=/source,readonly`,
          this.imageId,
          "--exclude=node_modules",
          "-cf",
          "-",
          "-C",
          "/source",
          ".",
        ],
        { output: archive },
      );
      await extractWorkspaceArchive(archive, destination, {
        sourceRoot: "/workspace",
      });
    } finally {
      await rm(archive, { force: true });
    }
  }
  async stop() {
    if (this.stopped) return;
    await this.command(["stop", "--time", "15", this.name], {
      timeoutMs: 30_000,
    });
    this.stopped = true;
  }
  async saveDatabase(destination: string) {
    if (!this.stopped)
      throw new Error("Stop the candidate before archiving its database");
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        await this.command([
          "cp",
          `${this.name}:/home/dev/.local/share/opencode/opencode.db${suffix}`,
          destination + suffix,
        ]);
      } catch (error) {
        if (!suffix) throw error;
      }
    }
  }
  async inspect(command: string[]) {
    return this.command(["exec", "--user", "dev", this.name, ...command]);
  }
  async close() {
    if (this.removed) return;
    this.removed = true;
    await this.command(["rm", "--force", this.name]).catch(() => {});
    for (const volume of [this.workspaceVolume, this.homeVolume])
      await this.command(["volume", "rm", volume]).catch(() => {});
  }
  async [Symbol.asyncDispose]() {
    await this.close();
  }
}
