import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { docs, docHref, docMarkdownHref, overview } from "./src/content";
import { GITHUB, SITE, VERSION } from "./src/examples";
import { renderDocument } from "./markdown";
import { guideActions, overviewSections } from "./src/overview-content";

const directory = fileURLToPath(new URL("./", import.meta.url));
export const markdownPages: Record<string, string> = {
  "/": "/index.md",
  ...Object.fromEntries(
    docs.map((doc) => [docHref(doc.slug), docMarkdownHref(doc.slug)]),
  ),
};

export async function readSkillFiles() {
  const root = resolve(directory, "../../.opencode/skills/eval-writing");
  const files: Record<string, string> = {};
  async function read(path = "") {
    for (const entry of await readdir(resolve(root, path), {
      withFileTypes: true,
    })) {
      const name = path ? `${path}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await read(name);
      else if (entry.isFile())
        files[name] = await readFile(resolve(root, name), "utf8");
    }
  }
  await read();
  return Object.fromEntries(
    Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
  );
}

export async function agentFiles(): Promise<
  Record<string, string | Uint8Array>
> {
  const skill = await readSkillFiles();
  // Named entry files retain the eval-writing ID in OpenCode V2 HTTP catalogs.
  // README is included in the project ZIP, not advertised as a second flat skill.
  const hosted = Object.fromEntries(
    Object.entries(skill)
      .filter(([path]) => path !== "README.md")
      .map(([path, body]) => [
        path === "SKILL.md" ? "eval-writing.md" : path,
        body,
      ]),
  );
  const version = createHash("sha256")
    .update(JSON.stringify(hosted))
    .digest("hex")
    .slice(0, 16);
  const comparison = await readFile(
    resolve(directory, "demo/benchmark.ts"),
    "utf8",
  );
  return {
    "/llms.txt": [
      "# OpenEval",
      "",
      "> Write agent evals with task prompts, code or LLM judges, isolated OpenCode runs, and an evidence viewer.",
      "",
      `Documentation for @hona/openeval ${VERSION}, using the 0.3.0 API and results schema 5. Pin an exact released SDK version.`,
      "A benchmark contains evals. A criterion is a graded requirement; a score is awarded credit; a metric is a measurement.",
      "For setup, read the agent guide first. Read other pages as needed. Each linked Markdown page contains the same documentation as its HTML page.",
      "Existing page URLs also return Markdown when the Accept header prefers text/markdown or text/x-markdown over HTML.",
      "",
      "## Start",
      "",
      `- [Agent setup guide](${SITE}/agent-start.md): Interactive setup, prerequisites, local skill installation, one eval, model choices, and an optional first run.`,
      `- [Overview](${SITE}/index.md): Task, judge, run, inspect, and compare examples.`,
      ...["Start", "Author", "Run & inspect", "Reference"].flatMap(
        (group, index) => [
          ...(index ? ["", `## ${group}`, ""] : []),
          ...docs
            .filter((doc) => doc.group === group)
            .map(
              (doc) =>
                `- [${doc.title}](${SITE}${docMarkdownHref(doc.slug)}): ${doc.description}`,
            ),
        ],
      ),
      "",
      "## Eval Writing skill",
      "",
      `- [Skill instructions](${SITE}/skills/eval-writing/eval-writing.md): Public eval design and review workflow; includes links to its references.`,
      `- [Skill catalog](${SITE}/skills/index.json): Native OpenCode V2 HTTP catalog, with content-versioned files.`,
      `- [Project skill download](${SITE}/eval-writing.zip): Extract into a project to install .opencode/skills/eval-writing/ and all references.`,
      "",
      "## Optional",
      "",
      `- [SQL starter](${SITE}/starter.zip): Benchmark files for the human quick start.`,
      `- [Source repository](${GITHUB}): Public SDK, CLI, viewer, documentation, and the source-controlled agent-start.md.`,
      "- [OpenCode V2 documentation](https://opencode.ai/v2/llms.txt): Installation, connections, models, variants, skills, and tools.",
      "",
    ].join("\n"),
    "/agent-start.md": await readFile(
      resolve(directory, "../../agent-start.md"),
      "utf8",
    ),
    "/index.md": renderDocument(
      { ...overview, sections: overviewSections(comparison) },
      [{ type: "links", items: Object.values(guideActions) }],
    ),
    ...Object.fromEntries(
      docs.map((doc) => [docMarkdownHref(doc.slug), renderDocument(doc)]),
    ),
    "/skills/index.json":
      JSON.stringify(
        {
          skills: [
            { name: "eval-writing", version, files: Object.keys(hosted) },
          ],
        },
        null,
        2,
      ) + "\n",
    ...Object.fromEntries(
      Object.entries(hosted).map(([path, body]) => [
        `/skills/eval-writing/${path}`,
        body,
      ]),
    ),
    "/eval-writing.zip": zipSync(
      Object.fromEntries(
        Object.entries(skill).map(([path, body]) => [
          `.opencode/skills/eval-writing/${path}`,
          strToU8(body),
        ]),
      ),
      { level: 9, mtime: new Date("2026-01-01T00:00:00Z") },
    ),
  };
}

export const agentContentType = (path: string) =>
  path.endsWith(".md")
    ? "text/markdown; charset=utf-8"
    : path.endsWith(".json")
      ? "application/json; charset=utf-8"
      : path.endsWith(".zip")
        ? "application/zip"
        : "text/plain; charset=utf-8";
