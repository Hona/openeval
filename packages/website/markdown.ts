import type { Block, Doc } from "./src/content";
import { SITE } from "./src/examples";

export const codeFence = (code: string, language = "text") => {
  const length = Math.max(
    3,
    ...[...code.matchAll(/`+/g)].map(([run]) => run.length + 1),
  );
  const fence = "`".repeat(length);
  return `${fence}${language}\n${code}${code.endsWith("\n") ? "" : "\n"}${fence}`;
};

const cell = (text: string) =>
  text.replaceAll("|", "\\|").replaceAll("\n", "<br>");
export const markdownTable = (columns: string[], rows: string[][]) =>
  [columns, columns.map(() => "---"), ...rows]
    .map((row) => `| ${row.map(cell).join(" | ")} |`)
    .join("\n");

function renderBlock(block: Block): string {
  switch (block.type) {
    case "text":
      return block.text;
    case "links":
      return block.items
        .map(({ label, href }) => {
          const url = new URL(href, SITE);
          if (url.origin === SITE && /^\/docs\/[^/]+\/$/.test(url.pathname))
            url.pathname += "index.md";
          return `[${label}](${url.href})`;
        })
        .join(" · ");
    case "code":
      return `### ${block.file}\n\n${codeFence(block.code, block.language)}`;
    case "table":
      return markdownTable(block.columns, block.rows);
    case "note":
      return `> **${block.title}**\n>\n${block.text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}`;
    case "flow":
      return block.steps
        .map((step, index) => `${index + 1}. ${step}`)
        .join("\n");
    case "image":
      return `![${block.alt}](${SITE}/images/${block.image})\n\n${block.caption}`;
    case "calculator":
      return [
        markdownTable(
          ["Eval", "Criterion", "Score"],
          [
            ["SQL query", "Asks for dialect", "1"],
            ["SQL query", "Bound parameters", "0"],
            ["Issue summary", "Actionable summary", "1"],
          ],
        ),
        "The eval scores are 50% and 100%. Their equal-weight mean is 75%.",
        "If Actionable summary is unknown, the benchmark is unresolved with completion bounds of 25–75%.",
      ].join("\n\n");
  }
}

export function renderDocument(doc: Doc) {
  return [
    `# ${doc.title}`,
    doc.description,
    ...doc.sections.flatMap((section) => [
      `<a id="${section.id}"></a>\n\n## ${section.title}`,
      ...section.blocks.map(renderBlock),
    ]),
    `[Documentation index](${SITE}/llms.txt)`,
    "",
  ].join("\n\n");
}
