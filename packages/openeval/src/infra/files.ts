import { createHash } from "node:crypto";
import { lstat, readdir, readlink, mkdir } from "node:fs/promises";
import { resolve, relative, isAbsolute, sep } from "node:path";

export const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export const fingerprint = (value: unknown) =>
  hash(
    JSON.stringify(value, (_key, item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(
            Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
          )
        : item,
    ),
  );
export const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return typeof error === "object" ? JSON.stringify(error) : String(error);
};
export const contained = (root: string, path: string) => {
  const resolved = resolve(root, path);
  if (resolved !== root && !resolved.startsWith(root + sep))
    throw new Error(`Path escapes its directory: ${path}`);
  return resolved;
};
export const relativePath = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    !value ||
    isAbsolute(value) ||
    value.split(/[\\/]/).includes("..")
  )
    throw new Error(`${label} must be a contained relative path`);
  return value;
};
export async function treeHash(
  root: string,
  options: { ignore?: RegExp } = {},
): Promise<string> {
  const entries: unknown[] = [];
  async function visit(path: string) {
    const stat = await lstat(path),
      name = relative(root, path).replaceAll("\\", "/");
    if (stat.isSymbolicLink()) {
      entries.push([name, "link", await readlink(path)]);
      return;
    }
    if (stat.isDirectory()) {
      for (const child of (await readdir(path)).sort()) {
        if (child === "node_modules" || options.ignore?.test(child)) continue;
        await visit(resolve(path, child));
      }
    } else
      entries.push([
        name,
        stat.mode & 0o777,
        hash(await Bun.file(path).bytes()),
      ]);
  }
  await visit(root);
  return fingerprint(entries);
}
export async function writeJson(path: string, value: unknown) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await Bun.write(path, JSON.stringify(value, null, 2) + "\n");
}
