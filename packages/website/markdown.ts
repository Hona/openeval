import type { Block, Doc } from "./src/content";
import { SITE } from "./src/examples";
import {
  calculator,
  calculatorLabel,
  calculatorScore,
  calculatorStatus,
  decisionLabel,
} from "./demo/calculator";

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
        `### ${calculator.title}`,
        calculator.description,
        markdownTable(
          ["Eval", "Criterion", "Score"],
          calculator.criteria.map((criterion, index) => [
            criterion.evalName,
            criterion.name,
            decisionLabel(calculator.values[index]),
          ]),
        ),
        `${calculator.scoreLabel}: **${calculatorLabel(calculatorScore())}** · ${calculatorStatus(calculatorScore())}`,
        calculator.hint,
        `[${calculator.title}](${SITE}${calculator.href})`,
      ].join("\n\n");
  }
}

export function renderDocument(
  doc: Pick<Doc, "title" | "description" | "sections">,
  intro: Block[] = [],
) {
  return [
    `# ${doc.title}`,
    doc.description,
    ...intro.map(renderBlock),
    ...doc.sections.flatMap((section) => [
      `<a id="${section.id}"></a>\n\n## ${section.title}`,
      ...section.blocks.map(renderBlock),
    ]),
    `[Documentation index](${SITE}/llms.txt)`,
    "",
  ].join("\n\n");
}
