import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, readlink, rm, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { pack } from "tar-stream";
import { extractWorkspaceArchive } from "./transfer";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test("extracts regular workspace files and preserves executable mode", async () => {
  const directory = await temporaryDirectory();
  const archive = resolve(directory, "workspace.tar");
  await writeArchive(archive, [
    { name: "./src/", type: "directory" },
    { name: "./src/run.sh", type: "file", mode: 0o755, body: "#!/bin/sh\n" },
  ]);
  const output = resolve(directory, "output");
  await extractWorkspaceArchive(archive, output);

  expect(await readFile(resolve(output, "src/run.sh"), "utf8")).toBe(
    "#!/bin/sh\n",
  );
  if (process.platform !== "win32")
    expect((await stat(resolve(output, "src/run.sh"))).mode & 0o777).toBe(
      0o755,
    );
});

test("preserves symlinks that stay within the workspace", async () => {
  const directory = await temporaryDirectory();
  const archive = resolve(directory, "workspace.tar");
  await writeArchive(archive, [
    { name: "target.txt", type: "file", body: "target" },
    { name: "links/target.txt", type: "symlink", linkname: "../target.txt" },
  ]);
  const output = resolve(directory, "output");
  await extractWorkspaceArchive(archive, output);
  expect(
    resolve(
      output,
      "links",
      await readlink(resolve(output, "links/target.txt")),
    ),
  ).toBe(resolve(output, "target.txt"));
});

test("rejects traversal and link entries", async () => {
  const directory = await temporaryDirectory();
  const traversal = resolve(directory, "traversal.tar");
  await writeArchive(traversal, [
    { name: "../outside.txt", type: "file", body: "no" },
  ]);
  await expect(
    extractWorkspaceArchive(traversal, resolve(directory, "traversal")),
  ).rejects.toThrow("Unsafe workspace archive path");

  const symlink = resolve(directory, "symlink.tar");
  await writeArchive(symlink, [
    { name: "escape", type: "symlink", linkname: "/etc/passwd" },
  ]);
  await expect(
    extractWorkspaceArchive(symlink, resolve(directory, "symlink")),
  ).rejects.toThrow("Unsafe workspace symlink target for escape");
});

test("restores absolute Linux workspace links as portable local links", async () => {
  const directory = await temporaryDirectory();
  const archive = resolve(directory, "linux.tar");
  await writeArchive(archive, [
    {
      name: "checkout/alias.txt",
      type: "symlink",
      linkname: "/workspace/checkout/source.txt",
    },
    { name: "checkout/source.txt", type: "file", body: "source" },
  ]);
  const output = resolve(directory, "output");
  await extractWorkspaceArchive(archive, output, { sourceRoot: "/workspace" });
  expect(await readFile(resolve(output, "checkout/alias.txt"), "utf8")).toBe(
    "source",
  );
  expect(await readlink(resolve(output, "checkout/alias.txt"))).toBe(
    "source.txt",
  );
  const unsafe = resolve(directory, "unsafe.tar");
  await writeArchive(unsafe, [
    { name: "bad", type: "symlink", linkname: "/etc/passwd" },
  ]);
  await expect(
    extractWorkspaceArchive(unsafe, resolve(directory, "unsafe"), {
      sourceRoot: "/workspace",
    }),
  ).rejects.toThrow("outside /workspace");
});

const temporaryDirectory = async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eval-runner-archive-"));
  directories.push(directory);
  return directory;
};

const writeArchive = async (
  path: string,
  entries: Array<{
    name: string;
    type: "directory" | "file" | "symlink";
    mode?: number;
    body?: string;
    linkname?: string;
  }>,
) => {
  const archive = pack();
  const writing = pipeline(archive, createWriteStream(path));
  for (const entry of entries)
    await new Promise<void>((resolveEntry, reject) =>
      archive.entry(
        {
          name: entry.name,
          type: entry.type,
          mode: entry.mode,
          linkname: entry.linkname,
        },
        entry.body,
        (cause) => (cause ? reject(cause) : resolveEntry()),
      ),
    );
  archive.finalize();
  await writing;
};
