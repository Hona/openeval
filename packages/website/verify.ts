import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { deepStrictEqual } from "node:assert";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import { loadBenchmark } from "@hona/openeval";
import { docs, docHref } from "./src/content";
import { prompt, SITE, VERSION } from "./src/examples";
import { screenshotDimensions } from "./src/media";

const directory = fileURLToPath(new URL("./", import.meta.url));
const dist = resolve(directory, "dist");
const glossary = await Bun.file(resolve(directory, "../../TERMINOLOGY.md")).text();
const glossaryRows = glossary.split("\n")
  .filter((line) => line.startsWith("| ")).slice(2)
  .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
const glossaryTable = docs.find((doc) => doc.slug === "terminology")
  ?.sections.find((section) => section.id === "terms")
  ?.blocks.find((block) => block.type === "table");
deepStrictEqual(glossaryTable?.rows, glossaryRows,
  "Website definitions must match TERMINOLOGY.md");
for (const [name, size] of Object.entries(screenshotDimensions)) {
  const bytes = await Bun.file(resolve(dist, "images", name)).arrayBuffer();
  const png = new DataView(bytes);
  if (png.getUint32(16) !== size.width || png.getUint32(20) !== size.height)
    throw new Error(
      `Image dimensions changed; update its reserved space: ${name}`,
    );
}
const paths = ["/", ...docs.map((doc) => docHref(doc.slug))];
for (const path of paths) {
  const html = await Bun.file(
    resolve(dist, path.slice(1), "index.html"),
  ).text();
  if ([...html.matchAll(/<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="font")[^>]*>/g)].length !== 2)
    throw new Error(`Missing theme font preloads: ${path}`);
  if (html.includes("<!--app-html-->") || !html.includes('class="site-shell"'))
    throw new Error(`Page was not prerendered: ${path}`);
  if (!html.includes(`rel="canonical" href="${SITE}${path}"`))
    throw new Error(`Missing canonical URL: ${path}`);
  const doc = docs.find((doc) => docHref(doc.slug) === path);
  if (doc)
    for (const section of doc.sections)
      if (!html.includes(`id="${section.id}"`))
        throw new Error(`Missing readable section: ${path}#${section.id}`);
  for (const match of html.matchAll(/(?:href|src)="(\/[^"#?]*)(?:#[^"]*)?"/g)) {
    const target = match[1];
    if (!target || target.startsWith("//")) continue;
    const file = target.endsWith("/")
      ? resolve(dist, target.slice(1), "index.html")
      : resolve(dist, target.slice(1));
    if (!(await Bun.file(file).exists()))
      throw new Error(`Broken asset or page link in ${path}: ${target}`);
  }
}
const root = await mkdtemp(
  resolve(
    process.platform === "win32" ? "C:/tmp/opencode" : tmpdir(),
    "site-starter-",
  ),
);
try {
  const zip = unzipSync(
    new Uint8Array(await Bun.file(resolve(dist, "starter.zip")).arrayBuffer()),
  );
  for (const [path, value] of Object.entries(zip)) {
    if (!path.startsWith("my-benchmark/") || path.includes(".."))
      throw new Error("Unexpected starter path");
    const file = resolve(root, path);
    await mkdir(resolve(file, ".."), { recursive: true });
    await writeFile(file, value);
  }
  const benchmark = await loadBenchmark(resolve(root, "my-benchmark"));
  if (benchmark.evals.length !== 1 || benchmark.evals[0].metrics.length !== 2)
    throw new Error("Starter criterion declarations are invalid");
  if (benchmark.evals[0].prompt.trim() !== prompt)
    throw new Error("Starter prompt differs from the documentation");
  const manifest = JSON.parse(strFromU8(zip["my-benchmark/package.json"]));
  if (manifest.dependencies["@hona/openeval"] !== VERSION)
    throw new Error("Starter must pin the documented release");
} finally {
  await rm(root, { recursive: true, force: true });
}
console.log({
  pages: paths.length,
  prerendering: "verified",
  links: "verified",
  starter: "loads through the public SDK",
  liveModelCalls: 0,
});
