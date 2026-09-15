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
import { markdownPages, readSkillFiles } from "./agent-files";

const directory = fileURLToPath(new URL("./", import.meta.url));
const dist = resolve(directory, "dist");
const glossary = await Bun.file(
  resolve(directory, "../../TERMINOLOGY.md"),
).text();
const glossaryRows = glossary
  .split("\n")
  .filter((line) => line.startsWith("| "))
  .slice(2)
  .map((line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim()),
  );
const glossaryTable = docs
  .find((doc) => doc.slug === "terminology")
  ?.sections.find((section) => section.id === "terms")
  ?.blocks.find((block) => block.type === "table");
deepStrictEqual(
  glossaryTable?.rows,
  glossaryRows,
  "Website definitions must match TERMINOLOGY.md",
);
for (const [name, size] of Object.entries(screenshotDimensions)) {
  const bytes = await Bun.file(resolve(dist, "images", name)).arrayBuffer();
  const png = new DataView(bytes);
  if (png.getUint32(16) !== size.width || png.getUint32(20) !== size.height)
    throw new Error(
      `Image dimensions changed; update its reserved space: ${name}`,
    );
}
const paths = ["/", ...docs.map((doc) => docHref(doc.slug)), "/404.html"];
for (const path of paths) {
  const html = await Bun.file(
    path === "/404.html"
      ? resolve(dist, "404.html")
      : resolve(dist, path.slice(1), "index.html"),
  ).text();
  if (!/<title>OpenEval \| [^<]+<\/title>/.test(html))
    throw new Error(`Unexpected page title: ${path}`);
  if (
    [
      ...html.matchAll(
        /<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="font")[^>]*>/g,
      ),
    ].length !== 2
  )
    throw new Error(`Missing theme font preloads: ${path}`);
  if (html.includes("<!--app-html-->") || !html.includes('class="site-shell"'))
    throw new Error(`Page was not prerendered: ${path}`);
  if (!html.includes(`rel="canonical" href="${SITE}${path}"`))
    throw new Error(`Missing canonical URL: ${path}`);
  if (!html.includes('rel="describedby" href="/llms.txt"'))
    throw new Error(`Missing documentation index: ${path}`);
  if (
    markdownPages[path] &&
    !html.includes(`type="text/markdown" href="${markdownPages[path]}"`)
  )
    throw new Error(`Missing Markdown alternate: ${path}`);
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
const index = await Bun.file(resolve(dist, "llms.txt")).text();
if (
  !index.startsWith("# OpenEval\n") ||
  !index.includes(`@hona/openeval ${VERSION}`)
)
  throw new Error("Documentation index must name the current release");
const agentStart = await Bun.file(resolve(dist, "agent-start.md")).text();
if (
  agentStart !==
  (await Bun.file(resolve(directory, "../../agent-start.md")).text())
)
  throw new Error("Published agent guide differs from agent-start.md");
const skill = await readSkillFiles();
const catalog = await Bun.file(resolve(dist, "skills/index.json")).json();
const entry = catalog.skills.find(
  (entry: { name: string }) => entry.name === "eval-writing",
);
if (
  !entry?.version ||
  !entry.files.includes("eval-writing.md") ||
  entry.files.includes("SKILL.md")
)
  throw new Error(
    "Use the named skill entry so OpenCode V2 discovers eval-writing",
  );
const skillZip = unzipSync(
  new Uint8Array(
    await Bun.file(resolve(dist, "eval-writing.zip")).arrayBuffer(),
  ),
);
deepStrictEqual(
  Object.keys(skillZip).sort(),
  Object.keys(skill)
    .map((path) => `.opencode/skills/eval-writing/${path}`)
    .sort(),
);
for (const [path, content] of Object.entries(skill)) {
  if (strFromU8(skillZip[`.opencode/skills/eval-writing/${path}`]) !== content)
    throw new Error(`Skill ZIP differs from its source: ${path}`);
  if (path === "README.md") {
    if (entry.files.includes(path))
      throw new Error("README must not register as a separate HTTP skill");
    continue;
  }
  const hosted = path === "SKILL.md" ? "eval-writing.md" : path;
  if (!entry.files.includes(hosted))
    throw new Error(`Skill catalog omits ${path}`);
  if (
    (await Bun.file(resolve(dist, "skills/eval-writing", hosted)).text()) !==
    content
  )
    throw new Error(`Hosted skill differs from its source: ${path}`);
}
const markdownFiles = [
  "/llms.txt",
  "/agent-start.md",
  ...Object.values(markdownPages),
  ...entry.files.map((path: string) => `/skills/eval-writing/${path}`),
];
for (const path of markdownFiles) {
  const markdown = await Bun.file(resolve(dist, path.slice(1))).text();
  if (!markdown.trim() || markdown.includes("<!doctype html>"))
    throw new Error(`Unreadable Markdown: ${path}`);
  for (const [, href] of markdown.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
    const url = new URL(href, `${SITE}${path}`);
    if (url.origin !== SITE) continue;
    const target = url.pathname.endsWith("/")
      ? `${url.pathname}index.html`
      : url.pathname;
    if (!(await Bun.file(resolve(dist, target.slice(1))).exists()))
      throw new Error(`Broken Markdown link in ${path}: ${href}`);
  }
}
for (const doc of docs) {
  const markdown = await Bun.file(
    resolve(dist, markdownPages[docHref(doc.slug)].slice(1)),
  ).text();
  for (const section of doc.sections) {
    if (!markdown.includes(`## ${section.title}`))
      throw new Error(`Missing Markdown section: ${doc.slug}#${section.id}`);
    for (const block of section.blocks)
      if (block.type === "code" && !markdown.includes(block.code))
        throw new Error(
          `Markdown changed a code sample: ${doc.slug}/${block.file}`,
        );
  }
}
const headers = await Bun.file(resolve(dist, "_headers")).text();
if (!headers.includes("/*.md\n  Content-Type: text/markdown; charset=utf-8"))
  throw new Error("Markdown assets need an explicit textual content type");
if (!(await Bun.file(resolve(dist, "_worker.js")).exists()))
  throw new Error("Missing Markdown negotiation worker");
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
  if (benchmark.evals.length !== 1 || benchmark.evals[0].criteria.length !== 2)
    throw new Error("Starter criterion declarations are invalid");
  if (benchmark.evals[0].prompt.trim() !== prompt)
    throw new Error("Starter prompt differs from the documentation");
  if (
    benchmark.repetitions !== 1 ||
    benchmark.models.length !== 1 ||
    benchmark.candidate.websearch !== false ||
    benchmark.judge.websearch !== false
  )
    throw new Error(
      "Starter must match the one-repetition quick start without web search",
    );
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
  agentDocs: `${markdownFiles.length} index, guide, documentation, and skill files verified`,
  skill: "catalog and project ZIP match public sources",
  starter: "loads through the public SDK",
  liveModelCalls: 0,
});
