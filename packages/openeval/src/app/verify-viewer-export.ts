import { lstat, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { ViewerAsset, ViewerExport } from "../viewer-export";
import { Publication } from "../infra/publishing";

/** Verify the closed set of public data files, including integrity and secret patterns. */
export async function verifyViewerExport(
  directory: string,
  secrets: readonly string[] = [],
) {
  const root = resolve(directory);
  for (const path of [
    root,
    resolve(root, "objects"),
    resolve(root, "manifest.json"),
  ])
    if ((await lstat(path)).isSymbolicLink())
      throw new Error("Public exports cannot contain symlinks");
  const policy = new Publication(secrets);
  const manifestText = await Bun.file(resolve(root, "manifest.json")).text();
  policy.assertClean(manifestText);
  const manifest = JSON.parse(manifestText) as ViewerExport;
  if (manifest.version !== 1 || manifest.source?.resultsSchema !== 5)
    throw new Error("Unsupported viewer export");
  const refs: ViewerAsset[] = [
    manifest.index,
    manifest.modelMetrics,
    manifest.overview,
    ...Object.values(manifest.results).flatMap((result) => [
      result.summary,
      ...(result.runs ? [result.runs] : []),
    ]),
    ...Object.values(manifest.sessions),
    ...Object.values(manifest.judges),
    ...Object.values(manifest.evidence).flatMap((checks) =>
      Object.values(checks),
    ),
  ];
  const files = new Map<string, ViewerAsset>();
  for (const ref of refs) {
    if (
      !ref ||
      !/^[a-f0-9]{64}$/.test(ref.sha256) ||
      !Number.isSafeInteger(ref.bytes) ||
      ref.bytes < 0 ||
      ref.bytes > 25 * 1024 * 1024 ||
      (ref.path !== `objects/${ref.sha256}.json` &&
        ref.path !== "overview.json")
    )
      throw new Error("Invalid public asset reference");
    const previous = files.get(ref.path);
    if (
      previous &&
      (previous.sha256 !== ref.sha256 || previous.bytes !== ref.bytes)
    )
      throw new Error("Conflicting public asset identities");
    files.set(ref.path, ref);
  }
  let bytes = Buffer.byteLength(manifestText);
  for (const ref of files.values()) {
    const path = resolve(root, ref.path);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error("Public assets must be regular files");
    const body = await Bun.file(path).bytes();
    if (
      body.byteLength !== ref.bytes ||
      createHash("sha256").update(body).digest("hex") !== ref.sha256
    )
      throw new Error(`Public asset integrity mismatch: ${ref.path}`);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    policy.assertClean(text);
    JSON.parse(text);
    bytes += body.byteLength;
  }
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink())
      throw new Error("Public exports cannot contain symlinks");
    if (entry.name === "objects" && entry.isDirectory()) {
      for (const object of await readdir(resolve(root, "objects"), {
        withFileTypes: true,
      }))
        if (!object.isFile() || !files.has(`objects/${object.name}`))
          throw new Error("Unreferenced file in public data export");
    } else if (entry.name === "assets" && entry.isDirectory()) {
      const inspect = async (directory: string): Promise<void> => {
        for (const asset of await readdir(directory, { withFileTypes: true })) {
          const file = resolve(directory, asset.name);
          if (asset.isSymbolicLink())
            throw new Error("Public viewer assets cannot contain symlinks");
          if (asset.isDirectory()) {
            await inspect(file);
            continue;
          }
          if (
            !asset.isFile() ||
            !/\.(?:js|css|wasm|woff2?|ttf|svg|png|jpg|webp|md)$/i.test(
              asset.name,
            )
          )
            throw new Error("Unexpected file in public viewer assets");
          if (/\.(?:js|css|svg|md)$/i.test(asset.name))
            policy.assertClean(await Bun.file(file).text());
        }
      };
      await inspect(resolve(root, "assets"));
    } else if (
      !["manifest.json", "overview.json", "index.html"].includes(entry.name) ||
      !entry.isFile()
    )
      throw new Error("Unexpected file in public data export");
    else if (entry.name === "index.html")
      policy.assertClean(await Bun.file(resolve(root, entry.name)).text());
  }
  return { manifest, files: files.size + 1, bytes };
}
