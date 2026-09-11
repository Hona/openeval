import { chmod, link, mkdir, symlink, stat, realpath } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { posix, resolve, dirname, sep } from "node:path";
import { extract } from "tar-stream";

export const extractWorkspaceArchive = async (
  archive: string,
  destination: string,
  options: { sourceRoot?: string } = {},
) => {
  const unpack = extract();
  const seen = new Set<string>();
  const links: Array<{ path: string; target: string; hard: boolean }> = [];
  unpack.on("entry", (header, stream, next) => {
    void unpackEntry(
      header,
      stream,
      destination,
      seen,
      links,
      options.sourceRoot,
    ).then(
      () => next(),
      (cause) => unpack.destroy(cause as Error),
    );
  });
  await pipeline(createReadStream(archive), unpack);
  for (const item of links.filter((item) => item.hard))
    await link(item.target, item.path);
  for (const item of links.filter((item) => !item.hard)) {
    const target = resolve(dirname(item.path), item.target);
    const info = await stat(target).catch(() => undefined);
    await symlink(item.target, item.path, info?.isDirectory() ? "dir" : "file");
  }
  const root = await realpath(destination);
  for (const item of links) {
    const actual = await realpath(item.path).catch(() => undefined);
    if (actual && actual !== root && !actual.startsWith(root + sep))
      throw new Error("Workspace link escapes its restored directory");
  }
};

const unpackEntry = async (
  header: {
    name: string;
    type?: string | null;
    mode?: number;
    linkname?: string | null;
  },
  stream: NodeJS.ReadableStream,
  destination: string,
  seen: Set<string>,
  links: Array<{ path: string; target: string; hard: boolean }>,
  sourceRoot?: string,
) => {
  const name = safeArchivePath(header.name);
  if (!name) {
    await drain(stream);
    return;
  }
  if (seen.has(name))
    throw new Error(`Duplicate workspace archive path: ${name}`);
  seen.add(name);
  const path = resolve(destination, name);
  if (header.type === "directory") {
    await drain(stream);
    await mkdir(path, { recursive: true, mode: safeMode(header.mode, 0o755) });
    return;
  }
  if (header.type === "symlink") {
    await drain(stream);
    const target = safeSymlinkTarget(name, header.linkname, sourceRoot);
    await mkdir(resolve(path, ".."), { recursive: true });
    links.push({ path, target, hard: false });
    return;
  }
  if (header.type === "link") {
    await drain(stream);
    const target = safeArchivePath(header.linkname ?? "");
    if (!target) throw new Error(`Unsafe workspace hardlink target: ${name}`);
    await mkdir(resolve(path, ".."), { recursive: true });
    links.push({ path, target: resolve(destination, target), hard: true });
    return;
  }
  if (header.type !== "file")
    throw new Error(
      `Unsupported workspace archive entry ${name}: ${header.type ?? "unknown"}`,
    );
  await mkdir(resolve(path, ".."), { recursive: true });
  await pipeline(
    stream,
    createWriteStream(path, { mode: safeMode(header.mode, 0o644) }),
  );
  await chmod(path, safeMode(header.mode, 0o644));
};

const safeSymlinkTarget = (
  name: string,
  value: string | null | undefined,
  sourceRoot?: string,
) => {
  if (value?.startsWith("/") && sourceRoot) {
    const target = posix.normalize(value),
      root = posix.normalize(sourceRoot).replace(/\/$/, "");
    if (target !== root && !target.startsWith(root + "/"))
      throw new Error(`Workspace symlink target is outside ${root}: ${value}`);
    value =
      posix.relative(posix.dirname(name), posix.relative(root, target)) || ".";
  }
  if (
    !value ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("\0")
  )
    throw new Error(
      `Unsafe workspace symlink target for ${name}: ${value ?? ""}`,
    );
  const resolved = posix.normalize(posix.join(posix.dirname(name), value));
  if (resolved === ".." || resolved.startsWith("../"))
    throw new Error(`Unsafe workspace symlink target for ${name}: ${value}`);
  return value;
};

const safeArchivePath = (value: string) => {
  const name = value.replace(/^\.\/+/, "").replace(/\/$/, "");
  if (!name || name === ".") return "";
  if (name.startsWith("/") || name.includes("\\") || name.includes("\0"))
    throw new Error(`Unsafe workspace archive path: ${value}`);
  const parts = name.split("/");
  if (parts.some((part) => !part || part === "." || part === ".."))
    throw new Error(`Unsafe workspace archive path: ${value}`);
  return parts.join("/");
};

const safeMode = (mode: number | undefined, fallback: number) =>
  mode === undefined ? fallback : mode & 0o777;

const drain = async (stream: NodeJS.ReadableStream) => {
  for await (const _chunk of stream as AsyncIterable<unknown>) {
    // Tar entries must be fully consumed before advancing to the next header.
  }
};
