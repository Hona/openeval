import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CodeJudgeDefinition } from "../../judge-context";
import { fingerprint } from "../files";

/** Bundle local imports without executing author code during planning. */
export async function compileCodeJudge(
  file: string,
): Promise<CodeJudgeDefinition> {
  file = resolve(file);
  const dependencies: Record<string, string> = {};
  const sdkManifest = fileURLToPath(
    new URL("../../../package.json", import.meta.url),
  );
  dependencies[sdkManifest] = await Bun.file(sdkManifest).text();
  const external = new Set<string>();
  const built = await Bun.build({
    entrypoints: [file],
    root: dirname(file),
    target: "bun",
    format: "esm",
    packages: "external",
    sourcemap: "external",
    plugins: [
      {
        name: "judge-dependencies",
        setup(build) {
          build.onResolve({ filter: /^[^./]/ }, (args) => {
            if (
              args.path.startsWith("node:") ||
              args.path.startsWith("bun:") ||
              isAbsolute(args.path)
            )
              return;
            const path = Bun.resolveSync(
              args.path,
              args.resolveDir || dirname(file),
            );
            external.add(path);
            return { path, external: true };
          });
        },
      },
    ],
  });
  if (!built.success)
    throw new Error(`Cannot compile judge.ts: ${built.logs.join("\n")}`);
  const source = await built.outputs
    .find((output) => output.kind === "entry-point")!
    .text();
  if (
    !new Bun.Transpiler({ loader: "js" })
      .scan(source)
      .exports.includes("default")
  )
    throw new Error("judge.ts must have a default function export");
  const sourceMap =
    (await built.outputs
      .find((output) => output.kind === "sourcemap")
      ?.text()) ?? "";
  const collect = async (directory: string, stopAtPackage: boolean) => {
    for (;;) {
      let found = false;
      for (const name of [
        "package.json",
        "bun.lock",
        "bun.lockb",
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
      ]) {
        const path = resolve(directory, name);
        if (await Bun.file(path).exists()) {
          dependencies[path] =
            name === "bun.lockb"
              ? Buffer.from(await Bun.file(path).bytes()).toString("base64")
              : await Bun.file(path).text();
          found ||= name === "package.json";
        }
      }
      if (found && stopAtPackage) return;
      const parent = dirname(directory);
      if (parent === directory) return;
      directory = parent;
    }
  };
  await collect(dirname(file), false);
  for (const path of external) await collect(dirname(path), true);
  return {
    file,
    source,
    sourceMap,
    dependencies,
    hash: fingerprint({ source, sourceMap, dependencies }),
  };
}
