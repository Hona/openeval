import { mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const metadata = await Bun.file(resolve(root, "packages/openeval/package.json")).json();
const archive = resolve(root, "artifacts", `hona-openeval-${metadata.version}.tgz`);
const directory = await mkdtemp(join(process.platform === "win32" ? "C:/tmp/opencode" : tmpdir(), "openeval-consumer-"));
const run = async (argv: string[], cwd = directory) => {
  const child = Bun.spawn(argv, { cwd, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (code) throw new Error(`${argv.join(" ")}: ${stderr || stdout}`);
  return stdout;
};
try {
  const files = (await run(["tar", "-tf", archive])).trim().split(/\r?\n/);
  for (const file of files) {
    if (/\/(?:evals|calibration|results|fixtures|node_modules)\/|\.test\.ts$/.test(file))
      throw new Error(`Unexpected published file: ${file}`);
  }
  for (const file of ["src/cli.ts", "src/index.ts", "src/infra/judging/judge-agent.md", "src/infra/containers/runtime/Dockerfile", "src/infra/containers/runtime/development-container", "viewer/index.html", "viewer/THIRD_PARTY_LICENSES.md", "LICENSE"])
    if (!files.includes(`package/${file}`)) throw new Error(`Missing package asset: ${file}`);
  await Bun.write(resolve(directory, "package.json"), JSON.stringify({
    name: "openeval-release-consumer", private: true, type: "module",
    dependencies: { "@hona/openeval": archive }, devDependencies: { "@types/bun": "latest" },
  }));
  await run(["bun", "install"]);
  console.log("Independent consumer installed");
  await Bun.write(resolve(directory, "verify.ts"), `
import { serveResults, loadBenchmark } from "@hona/openeval";
import type { Benchmark } from "@hona/openeval/types";
import { ResultReader } from "@hona/openeval/results";
import { modelScore } from "@hona/openeval/view";
import { emptyStage } from "@hona/openeval/session";
import { fileURLToPath } from "node:url";
const definition: Benchmark = { models: ["example/team/candidate#high"], judge: { model: "example/team/judge#low" } };
if (typeof loadBenchmark !== "function" || typeof ResultReader !== "function" || typeof modelScore !== "function" || typeof emptyStage !== "function") throw new Error("Invalid public exports");
await Bun.write("./fixture/benchmark.ts", "export default " + JSON.stringify(definition));
await Bun.write("./fixture/evals/answer/prompt.md", "Answer the question.");
await Bun.write("./fixture/evals/answer/judge.md", "## Metric: correct — Correct answer\\nPass when correct.");
const loaded = await loadBenchmark("./fixture");
if (loaded.models[0] !== definition.models[0] || loaded.judge.model !== definition.judge.model) throw new Error("Namespaced model references were not preserved");
const assetsPath = fileURLToPath(new URL("../viewer/", import.meta.resolve("@hona/openeval")));
const server = await serveResults({ resultsPath: "./results", port: 0, assetsPath });
try {
  const index = await (await fetch(server.url + "/api/results")).json();
  if (index.entries.length) throw new Error("Fresh consumer must have no results");
  const html = await (await fetch(server.url)).text();
  const asset = /src="([^"]+\\.js)"/.exec(html)?.[1];
  if (!asset) throw new Error("Built viewer entry is missing");
  const response = await fetch(server.url + asset);
  if (!response.ok || (await response.text()).length < 100) throw new Error("Viewer asset is unavailable");
} finally { await server.close(); }
console.log("Installed SDK exports and built viewer verified");
`);
  console.log(await run(["bun", "verify.ts"]));
  console.log("Checking consumer types");
  await run(["bun", resolve(root, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--skipLibCheck", "--module", "ESNext", "--moduleResolution", "Bundler", "--target", "ESNext", "--types", "bun", "verify.ts"]);
  const help = await run(["bun", "node_modules/@hona/openeval/src/cli.ts", "--help"]);
  if (!help.includes("Usage: openeval")) throw new Error("CLI help is missing");
  const version = await run(["bun", "node_modules/@hona/openeval/src/cli.ts", "--version"]);
  if (version.trim() !== metadata.version) throw new Error("CLI version does not match the package");
  console.log(JSON.stringify({ package: `${metadata.name}@${metadata.version}`, files: files.length, consumer: "passed", types: "passed", cli: "passed", viewer: "passed" }));
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
