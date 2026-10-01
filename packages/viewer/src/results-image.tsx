import { For } from "solid-js";
import { render } from "solid-js/web";
import { ProviderIcon } from "@opencode/ui/provider-icon";
import { formatNumber, modelName, provider, reasoning } from "./model";
import { scoreBounds, type ScoreBounds } from "@hona/openeval/view";
import { isRange, scorecardValue, type Scorecard } from "./scorecard";
import { criteriaCount, LOW_COVERAGE } from "./components/category-filter";

export type ResultsImage = {
  name: string;
  /** Shown after the name, such as "Frontier". */
  suite?: string;
  scores: Array<{
    model: string;
    percentage: number | null;
    bounds: ScoreBounds;
  }>;
};
export type ScorecardImage = {
  name: string;
  suite?: string;
  startedAt: string;
  card: Scorecard;
};

export const RESULTS_IMAGE_SIZE = { width: 1600, height: 900 };

const color = (token: string) => {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  probe.hidden = true;
  document.body.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
};

/** Paint one pixel to read sRGB channels, whatever color syntax the theme uses. */
const channels = (css: string): [number, number, number] => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [0, 0, 0];
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [red, green, blue] = ctx.getImageData(0, 0, 1, 1).data;
  return [red, green, blue];
};
/** The heatmap's `color-mix(in srgb, success X%, background)`, for the canvas. */
const mix = (
  top: [number, number, number],
  base: [number, number, number],
  amount: number,
) =>
  `rgb(${top.map((value, index) => Math.round(value * amount + base[index] * (1 - amount))).join(", ")})`;

/** Rasterize the published provider artwork, including its embedded definitions. */
const providerImages = async (ids: string[], foreground: string) => {
  const host = document.createElement("div");
  host.hidden = true;
  document.body.append(host);
  const dispose = render(
    () => <For each={ids}>{(id) => <ProviderIcon id={id} />}</For>,
    host,
  );
  const sprites = new Map<string, Promise<Document>>();
  try {
    return await Promise.all(
      [...host.querySelectorAll("use")].map(async (use) => {
        const href = new URL(use.getAttribute("href")!, location.href);
        const id = href.hash.slice(1);
        href.hash = "";
        if (!sprites.has(href.href))
          sprites.set(
            href.href,
            fetch(href).then(async (response) => {
              if (!response.ok) throw new Error("Could not load model icons");
              return new DOMParser().parseFromString(
                await response.text(),
                "image/svg+xml",
              );
            }),
          );
        const sprite = await sprites.get(href.href)!;
        const symbol = sprite.getElementById(id);
        if (!symbol) throw new Error(`Missing model icon: ${id}`);
        const svg = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        svg.setAttribute(
          "viewBox",
          symbol.getAttribute("viewBox") ?? "0 0 40 40",
        );
        svg.setAttribute("width", "128");
        svg.setAttribute("height", "128");
        svg.setAttribute("color", foreground);
        for (const child of symbol.childNodes)
          svg.append(child.cloneNode(true));
        const url = URL.createObjectURL(
          new Blob([new XMLSerializer().serializeToString(svg)], {
            type: "image/svg+xml",
          }),
        );
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          return image;
        } finally {
          URL.revokeObjectURL(url);
        }
      }),
    );
  } finally {
    dispose();
    host.remove();
  }
};

/** Shrink-to-fit text: one canvas helper shared by both exports. */
const writer = (ctx: CanvasRenderingContext2D) => ({
  text(
    value: string,
    x: number,
    y: number,
    size: number,
    width: number,
    fill: string,
    weight = 600,
    align: CanvasTextAlign = "left",
  ) {
    ctx.font = `${weight} ${size}px Inter, sans-serif`;
    const measured = ctx.measureText(value).width;
    if (measured > width)
      ctx.font = `${weight} ${(size * width) / measured}px Inter, sans-serif`;
    ctx.fillStyle = fill;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  },
  /** Greedy word wrap; anything beyond `max` lines joins the last line and shrinks. */
  lines(value: string, size: number, weight: number, width: number, max: number) {
    ctx.font = `${weight} ${size}px Inter, sans-serif`;
    const result: string[] = [];
    for (const word of value.split(/\s+/).filter(Boolean)) {
      const last = result.at(-1);
      if (last !== undefined && ctx.measureText(`${last} ${word}`).width <= width)
        result[result.length - 1] = `${last} ${word}`;
      else result.push(word);
    }
    return result.length > max
      ? [...result.slice(0, max - 1), result.slice(max - 1).join(" ")]
      : result;
  },
});

const encode = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not encode the PNG")),
      "image/png",
    ),
  );

/** A totals-only, fixed 16:9 PNG. No session content is exported. */
export async function createResultsImage(input: ResultsImage): Promise<Blob> {
  if (!input.scores.length) throw new Error("No model totals to export");
  await document.fonts.load("600 84px Inter");
  await document.fonts.load("440 24px Inter");
  const scores = input.scores
    .map((score) => ({
      ...score,
      percentage:
        typeof score.percentage === "number" &&
        Number.isFinite(score.percentage) &&
        score.percentage >= 0 &&
        score.percentage <= 100
          ? score.percentage
          : null,
    }))
    .sort((a, b) => scoreBounds(b).lower - scoreBounds(a).lower);
  const palette = {
    background: color("--app-bg"),
    text: color("--app-text"),
    muted: color("--app-muted"),
    border: color("--app-border"),
    bar: color("--app-success"),
  };
  const ids = [...new Set(scores.map((score) => provider(score.model)))];
  const icons = await providerImages(ids, palette.text);
  const canvas = document.createElement("canvas");
  canvas.width = RESULTS_IMAGE_SIZE.width;
  canvas.height = RESULTS_IMAGE_SIZE.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image export is unavailable in this browser");
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "alphabetic";
  const { text } = writer(ctx);
  const titleWidth = input.suite ? 1180 : 1520;
  text(input.name, 40, 99, 82, titleWidth, palette.text);
  if (input.suite) {
    const nameWidth = Math.min(ctx.measureText(input.name).width, titleWidth);
    text(input.suite, 40 + nameWidth + 28, 99, 42, 1520 - nameWidth - 28, palette.muted, 500);
  }
  const top = 145;
  const rowHeight = (canvas.height - top - 24) / scores.length;
  scores.forEach((score, index) => {
    const bounds = scoreBounds(score);
    const y = top + rowHeight * index;
    const center = y + rowHeight / 2;
    const iconSize = Math.min(72, rowHeight * 0.62);
    const nameSize = Math.min(44, rowHeight * 0.37);
    const scoreSize = Math.min(88, rowHeight * 0.76);
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(1560, y);
    ctx.stroke();
    ctx.drawImage(
      icons[ids.indexOf(provider(score.model))],
      36,
      center - iconSize / 2,
      iconSize,
      iconSize,
    );
    text(modelName(score.model), 132, center - 1, nameSize, 520, palette.text);
    text(
      reasoning(score.model),
      134,
      center + Math.min(30, rowHeight * 0.26),
      Math.min(25, rowHeight * 0.22),
      510,
      palette.muted,
      440,
    );
    const trackX = 700,
      trackWidth = 510,
      barHeight = Math.min(32, rowHeight * 0.28);
    if (bounds.lower > 0) {
      ctx.fillStyle = palette.bar;
      ctx.fillRect(
        trackX,
        center - barHeight / 2,
        (trackWidth * bounds.lower) / 100,
        barHeight,
      );
    }
    if (bounds.upper > bounds.lower + 0.000001) {
      const left = trackX + (trackWidth * bounds.lower) / 100,
        right = trackX + (trackWidth * bounds.upper) / 100;
      ctx.strokeStyle = palette.muted;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(left, center);
      ctx.lineTo(right, center);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(Math.round(right) + 0.5, center - 10);
      ctx.lineTo(Math.round(right) + 0.5, center + 10);
      ctx.stroke();
    }
    const value =
      bounds.upper > bounds.lower + 0.000001
        ? `${formatNumber(bounds.lower)}–${formatNumber(bounds.upper)}%`
        : `${formatNumber(bounds.lower)}%`;
    text(
      value,
      1560,
      center + scoreSize * 0.34,
      scoreSize,
      310,
      score.percentage === null ? palette.muted : palette.text,
      600,
      "right",
    );
  });
  return encode(canvas);
}

const TABLE = {
  margin: 48,
  benchmark: 250,
  category: 390,
  header: 176,
  row: 92,
  footer: 84,
  width: 1600,
};

/** The benchmark down the left, category rows, and model columns. Totals only. */
export async function createScorecardImage(input: ScorecardImage): Promise<Blob> {
  const { card } = input;
  if (!card.models.length || card.rows.length < 2)
    throw new Error("No category scores to export");
  await Promise.all(
    ["700 30px Inter", "650 28px Inter", "500 30px Inter", "440 18px Inter"].map(
      (font) => document.fonts.load(font),
    ),
  );
  const palette = {
    background: color("--app-bg"),
    layer: color("--app-layer"),
    text: color("--app-text"),
    muted: color("--app-muted"),
    faint: color("--app-faint"),
    border: color("--app-border"),
    success: color("--app-success"),
    warning: color("--v2-state-fg-warning"),
  };
  const success = channels(palette.success),
    background = channels(palette.background);
  const ids = [...new Set(card.models.map((model) => provider(model)))];
  const icons = await providerImages(ids, palette.text);
  const { margin, benchmark, category, header, row, footer } = TABLE;
  const column = Math.max(
    160,
    Math.min(
      240,
      (TABLE.width - 2 * margin - benchmark - category) / card.models.length,
    ),
  );
  const width = Math.max(
    TABLE.width,
    2 * margin + benchmark + category + column * card.models.length,
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image export is unavailable in this browser");
  const { text, lines } = writer(ctx);
  const names = card.models.map((model) =>
    lines(modelName(model), 25, 600, column - 24, 2),
  );
  const nameLines = Math.max(...names.map((name) => name.length));
  // The header grows only when a model name wraps.
  const top = margin + header - (2 - nameLines) * 30;
  const bottom = top + row * card.rows.length;
  canvas.height = bottom + footer;
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "alphabetic";
  const rule = (from: number, to: number, y: number) => {
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(from, Math.round(y) + 0.5);
    ctx.lineTo(to, Math.round(y) + 0.5);
    ctx.stroke();
  };
  const categoryX = margin + benchmark,
    modelsX = categoryX + category;

  text("Benchmark", margin, top - 22, 19, benchmark - 20, palette.faint, 440);
  text("Category", categoryX + 14, top - 22, 19, category - 28, palette.faint, 440);
  // Icons share one row just above the tallest wrapped name.
  const iconY = top - 128 - (nameLines - 1) * 30;
  card.models.forEach((model, index) => {
    const center = modelsX + column * index + column / 2;
    ctx.drawImage(icons[ids.indexOf(provider(model))], center - 20, iconY, 40, 40);
    const name = names[index];
    name.forEach((line, lineIndex) =>
      text(
        line,
        center,
        top - 52 - (name.length - 1 - lineIndex) * 30,
        25,
        column - 24,
        palette.text,
        600,
        "center",
      ),
    );
    text(reasoning(model), center, top - 22, 18, column - 24, palette.faint, 440, "center");
  });
  rule(margin, width - margin, top);

  const title = lines(input.name, 28, 650, benchmark - 28, 3);
  title.forEach((line, index) =>
    text(line, margin, top + 46 + index * 34, 28, benchmark - 28, palette.text, 650),
  );
  if (input.suite)
    text(input.suite, margin, top + 46 + (title.length - 1) * 34 + 30, 20, benchmark - 28, palette.muted, 500);
  card.rows.forEach((entry, rowIndex) => {
    const y = top + row * rowIndex;
    const middle = y + row / 2;
    if (rowIndex) rule(categoryX, width - margin, y);
    text(entry.name, categoryX + 14, middle - 4, 26, category - 28, palette.text, entry.overall ? 650 : 520);
    text(
      `${criteriaCount(entry.criteria)} · ${entry.evals} eval${entry.evals === 1 ? "" : "s"}`,
      categoryX + 14,
      middle + 22,
      16,
      category - 28,
      !entry.overall && entry.criteria < LOW_COVERAGE ? palette.warning : palette.faint,
      440,
    );
    entry.cells.forEach((cell, index) => {
      const x = modelsX + column * index + 5,
        tileY = y + 7,
        tileWidth = column - 10,
        tileHeight = row - 14;
      ctx.beginPath();
      ctx.roundRect(x, tileY, tileWidth, tileHeight, 8);
      ctx.fillStyle = entry.overall
        ? palette.layer
        : mix(success, background, (Math.min(100, Math.max(0, cell.bounds.lower)) / 100) * 0.55);
      ctx.fill();
      if (isRange(cell.bounds)) {
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = palette.muted;
        ctx.globalAlpha = 0.14;
        ctx.lineWidth = 1;
        for (let offset = -tileHeight; offset < tileWidth; offset += 6) {
          ctx.beginPath();
          ctx.moveTo(x + offset, tileY + tileHeight);
          ctx.lineTo(x + offset + tileHeight, tileY);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.beginPath();
      ctx.roundRect(x + 0.5, tileY + 0.5, tileWidth - 1, tileHeight - 1, 8);
      ctx.lineWidth = cell.leader ? 2 : 1;
      ctx.strokeStyle = cell.leader ? palette.success : palette.border;
      ctx.stroke();
      text(
        scorecardValue(cell.bounds),
        x + tileWidth / 2,
        middle + 10,
        isRange(cell.bounds) ? 24 : 30,
        tileWidth - 20,
        palette.text,
        cell.leader ? 700 : 500,
        "center",
      );
    });
  });
  rule(margin, width - margin, bottom);
  text(
    "Categories rescore only their criteria, with evals weighted equally. Ranges are unresolved checks, not confidence intervals. Bold marks a settled lead.",
    margin,
    bottom + 48,
    18,
    width - 2 * margin - 200,
    palette.muted,
    440,
  );
  text(input.startedAt.slice(0, 10), width - margin, bottom + 48, 18, 180, palette.muted, 440, "right");
  return encode(canvas);
}

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before releasing its source.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const fileName = (
  name: string,
  suite: string | undefined,
  startedAt: string,
  kind: string,
) =>
  `${[name, suite].filter(Boolean).join("-").replace(/[^a-zA-Z0-9_.-]/g, "-")}-${startedAt.slice(0, 10)}-${kind}.png`;

export async function downloadResultsImage(
  input: ResultsImage,
  startedAt: string,
) {
  download(
    await createResultsImage(input),
    fileName(input.name, input.suite, startedAt, "results"),
  );
}

export async function downloadScorecardImage(input: ScorecardImage) {
  download(
    await createScorecardImage(input),
    fileName(input.name, input.suite, input.startedAt, "categories"),
  );
}
