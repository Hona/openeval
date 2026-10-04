import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { CodeJudgeDefinition } from "../../judge-context";
import { fingerprint } from "../files";

/** Raise when a release changes what judge.ts receives or how it runs; every code judge then runs again. */
const CODE_JUDGE_PROTOCOL = 1;
const printer = new Bun.Transpiler({
  loader: "js",
  target: "bun",
  deadCodeElimination: false,
});

function portableDirectories(source: string) {
  return source.replace(
    /^\s*var __(?:dirname|filename) = .*$/gm,
    (line) => line.replace(/"(?:[^"\\]|\\.)*"/g, '""'),
  );
}

/** An unchanged self-contained executable can retain judgments whose older
 * identity included host package manifests and lockfiles. This is a read-only
 * identity check, not a rewrite of recorded code or a changed scoring rule.
 * External packages still require their exact executable identity. */
export function recordedCodeMatches(
  expected: CodeJudgeDefinition,
  recorded: CodeJudgeDefinition | undefined,
) {
  if (!recorded) return false;
  if (recorded.hash === expected.hash) return true;
  if (!expected.source.trim() || expected.source !== recorded.source ||
      Object.keys(expected.dependencies).length !== 0) return false;
  const imports = new Bun.Transpiler({ loader: "js" }).scan(expected.source).imports;
  if (imports.some(item => !item.path.startsWith("node:") && !item.path.startsWith("bun:"))) return false;
  const metadata = Object.keys(recorded.dependencies);
  if (!metadata.length || metadata.some(path =>
    !/(?:^|[\\/])(?:package\.json|bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(path))) return false;
  // Verify both identities rather than accepting an arbitrary mismatched hash.
  return CODE_JUDGE_PROTOCOL === 1 &&
    recorded.hash === fingerprint({ source: recorded.source, dependencies: recorded.dependencies }) &&
    expected.hash === fingerprint({ protocol: CODE_JUDGE_PROTOCOL,
      source: printer.transformSync(portableDirectories(expected.source)) });
}

/** The package that provides an external import, as `name@version/path`. */
async function packageSpecifier(path: string, from: string) {
  for (let directory = dirname(path); ; directory = dirname(directory)) {
    const manifest = Bun.file(resolve(directory, "package.json"));
    const { name, version } = (await manifest.exists())
      ? await manifest.json().catch(() => ({}))
      : {};
    if (typeof name === "string" && name)
      return `${name}@${version ?? ""}/${relative(directory, path).split(sep).join("/")}`;
    if (dirname(directory) === directory)
      return relative(from, path).split(sep).join("/");
  }
}

/** Bundle local imports without executing author code during planning. */
export async function compileCodeJudge(
  file: string,
): Promise<CodeJudgeDefinition> {
  file = resolve(file);
  const external = new Set<string>();
  const built = await Bun.build({
    // Import only the judge function: unused reporting metadata is tree-shaken.
    // If grading reads metadata, it remains executable and must affect the hash.
    entrypoints: ["openeval:judge-entry"],
    root: dirname(file),
    target: "bun",
    format: "esm",
    packages: "external",
    sourcemap: "external",
    plugins: [
      {
        name: "judge-dependencies",
        setup(build) {
          build.onResolve({ filter: /^openeval:judge-entry$/ }, () => ({ path: "judge.js", namespace: "openeval-judge" }));
          build.onLoad({ filter: /.*/, namespace: "openeval-judge" }, () => ({
            contents: `export { default } from ${JSON.stringify(file.replaceAll("\\", "/"))};`,
            loader: "js", resolveDir: dirname(file),
          }));
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
  // The executable keeps absolute import paths; identity uses the package name and version.
  const dependencies: Record<string, string> = {};
  let portable = source;
  for (const path of external) {
    const specifier = await packageSpecifier(path, dirname(file));
    dependencies[specifier] = path;
    portable = portable.replaceAll(
      JSON.stringify(path),
      JSON.stringify(specifier),
    );
  }
  // Bun writes __dirname and __filename as absolute paths. Like other runtime file inputs, they are not identity.
  portable = portableDirectories(portable);
  return {
    file,
    source,
    sourceMap,
    dependencies,
    // Reprinting drops comments: module comments name files relative to the working
    // directory, and the debug ID depends on them. Source maps are retained, not hashed.
    hash: fingerprint({
      protocol: CODE_JUDGE_PROTOCOL,
      source: printer.transformSync(portable),
    }),
  };
}
