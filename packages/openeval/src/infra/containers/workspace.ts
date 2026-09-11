import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
  rm,
  stat,
} from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { tmpdir } from "node:os";
import type { EvalDefinition } from "../../types";
import { contained } from "../files";

async function git(cwd: string, args: string[]) {
  const child = Bun.spawn(
    ["git", "-c", "core.autocrlf=false", "-c", "core.longpaths=true", ...args],
    {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
        GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
        GIT_CONFIG_NOSYSTEM: "1",
      },
    },
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0)
    throw new Error(`Workspace preparation failed: ${stderr.trim()}`);
  return stdout.trim();
}

/** Only project content enters the candidate. Host setup paths never survive in Git metadata. */
export async function prepareWorkspace(
  definition: EvalDefinition,
  destination: string,
) {
  if (!definition.settings.workspace)
    return assembleWorkspace(definition, destination);
  // Git for Windows still limits some internal paths even with core.longpaths.
  const staging = await mkdtemp(resolve(tmpdir(), "workspace-"));
  try {
    await assembleWorkspace(definition, staging);
    await cp(staging, destination, { recursive: true, verbatimSymlinks: true });
    return destination;
  } finally {
    await rm(staging, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
}

async function assembleWorkspace(
  definition: EvalDefinition,
  destination: string,
) {
  await mkdir(destination, { recursive: true });
  const fixture = definition.settings.workspace;
  if (fixture) {
    const remote = fixture.remote ?? "upstream",
      checkout = fixture.checkout ?? "checkout";
    // Authored fixtures remain inspectable; public inputs contain only their base commit.
    // https://deepswe.datacurve.ai/blog/deepswe-v1-1#verification
    if (fixture.repository) {
      await git(destination, ["init", "--bare", `${remote}.git`]);
      await git(destination, [
        "-C",
        `${remote}.git`,
        "remote",
        "add",
        "origin",
        fixture.repository,
      ]);
      await git(destination, [
        "-C",
        `${remote}.git`,
        "fetch",
        "--depth=1",
        "--no-tags",
        "origin",
        fixture.commit!,
      ]);
      await git(destination, [
        "-C",
        `${remote}.git`,
        "update-ref",
        `refs/heads/${fixture.ref}`,
        "FETCH_HEAD",
      ]);
    } else if (fixture.revisions) {
      const seed = await mkdtemp(resolve(dirname(destination), ".source-"));
      try {
        await git(seed, ["init", "--initial-branch=preparation"]);
        for (const revision of fixture.revisions) {
          await cp(contained(definition.directory, revision.directory), seed, {
            recursive: true,
            verbatimSymlinks: true,
          });
          await git(seed, ["add", "."]);
          // Overlays can preserve size and timestamp, so Git's stat cache can
          // miss changed bytes. Rehash tracked content before freezing a revision.
          await git(seed, ["add", "--renormalize", "."]);
          await git(seed, [
            "-c",
            "user.name=Developer",
            "-c",
            "user.email=developer@example.invalid",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "--allow-empty",
            "-m",
            revision.message,
          ]);
          await git(seed, ["update-ref", `refs/heads/${revision.ref}`, "HEAD"]);
        }
        await git(destination, [
          "clone",
          "--bare",
          "--no-hardlinks",
          seed,
          `${remote}.git`,
        ]);
        await git(destination, [
          "-C",
          `${remote}.git`,
          "update-ref",
          "-d",
          "refs/heads/preparation",
        ]);
      } finally {
        await rm(seed, { recursive: true, force: true });
      }
    } else
      throw new Error("Workspace requires a repository or readable revisions");
    await git(destination, [
      "clone",
      "--no-hardlinks",
      "--origin",
      remote,
      "--branch",
      fixture.ref,
      `${remote}.git`,
      checkout,
    ]);
    await git(destination, [
      "-C",
      checkout,
      "remote",
      "set-url",
      remote,
      `../${remote}.git`,
    ]);
    await git(destination, [
      "-C",
      `${remote}.git`,
      "remote",
      "remove",
      "origin",
    ]);
    const branch = await git(destination, [
      "-C",
      `${remote}.git`,
      "show-ref",
      "--verify",
      `refs/heads/${fixture.ref}`,
    ])
      .then(() => true)
      .catch(() => false);
    if (branch)
      await git(destination, [
        "-C",
        `${remote}.git`,
        "symbolic-ref",
        "HEAD",
        `refs/heads/${fixture.ref}`,
      ]);
    else
      await git(destination, [
        "-C",
        `${remote}.git`,
        "update-ref",
        "--no-deref",
        "HEAD",
        await git(destination, [
          "-C",
          `${remote}.git`,
          "rev-parse",
          `${fixture.ref}^{commit}`,
        ]),
      ]);
    await writeFile(
      resolve(destination, `${remote}.git/description`),
      `${checkout} upstream repository\n`,
    );
    if (fixture.commit) {
      const actual = await git(destination, [
        "-C",
        checkout,
        "rev-parse",
        "HEAD",
      ]);
      if (actual !== fixture.commit)
        throw new Error("Workspace does not match its pinned commit");
    }
    await normalizeGitMetadata(
      resolve(destination, checkout, ".git"),
      `../${remote}.git`,
    );
    await normalizeGitMetadata(
      resolve(destination, `${remote}.git`),
      undefined,
    );
    if (fixture.overlay)
      await cp(
        contained(definition.directory, fixture.overlay),
        resolve(destination, checkout),
        { recursive: true, verbatimSymlinks: true },
      );
  } else {
    const workspace = resolve(definition.directory, "workspace");
    if (
      await stat(workspace)
        .then((s) => s.isDirectory())
        .catch(() => false)
    )
      await cp(workspace, destination, {
        recursive: true,
        verbatimSymlinks: true,
        filter: (source) =>
          !relative(workspace, source).split(/[\\/]/).includes("node_modules"),
      });
  }
  await inspectWorkspace(destination);
  return destination;
}

async function normalizeGitMetadata(directory: string, upstream?: string) {
  const logs = resolve(directory, "logs");
  async function rewrite(path: string) {
    for (const entry of await readdir(path, { withFileTypes: true }).catch(
      () => [],
    )) {
      const file = resolve(path, entry.name);
      if (entry.isDirectory()) await rewrite(file);
      else {
        const text = await readFile(file, "utf8");
        await writeFile(
          file,
          text.replace(
            /clone: from .*/g,
            `clone: from ${upstream ?? "upstream"}`,
          ),
        );
      }
    }
  }
  await rewrite(logs);
  // The host's filesystem settings must not describe a Windows workspace in Linux.
  const config = resolve(directory, "config");
  await writeFile(
    config,
    (await readFile(config, "utf8")).replace(
      /^\s*(?:ignorecase|filemode)\s*=.*\n/gm,
      "",
    ),
  );
  await rm(resolve(directory, "FETCH_HEAD"), { force: true });
}

export async function inspectWorkspace(root: string) {
  const forbidden = /(?:clone: from |url\s*=\s*)(?:[A-Za-z]:[\\/]|\/)/i;
  async function visit(path: string) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (
        entry.isSymbolicLink() ||
        entry.name === "node_modules" ||
        entry.name === "objects"
      )
        continue;
      const file = resolve(path, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (
        /[\\/](?:\.git|[^\\/]+\.git)[\\/]/.test(file) &&
        forbidden.test(await readFile(file, "utf8"))
      )
        throw new Error(
          `Candidate Git metadata exposes harness provenance: ${relative(root, file)}`,
        );
    }
  }
  await visit(root);
}
