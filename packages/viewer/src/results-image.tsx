import { For } from "solid-js";
import { render } from "solid-js/web";
import { ProviderIcon } from "@opencode/ui/provider-icon";
import { formatNumber, modelName, provider, reasoning } from "./model";
import { scoreBounds, type ScoreBounds } from "@hona/openeval/view";

export type ResultsImage = {
  name: string;
  scores: Array<{
    model: string;
    percentage: number | null;
    bounds: ScoreBounds;
  }>;
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
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    width: number,
    fill: string,
    weight = 600,
    align: CanvasTextAlign = "left",
  ) => {
    ctx.font = `${weight} ${size}px Inter, sans-serif`;
    const measured = ctx.measureText(value).width;
    if (measured > width)
      ctx.font = `${weight} ${(size * width) / measured}px Inter, sans-serif`;
    ctx.fillStyle = fill;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  };
  text(input.name, 40, 99, 82, 1520, palette.text);
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
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not encode the PNG")),
      "image/png",
    ),
  );
}

export async function downloadResultsImage(
  input: ResultsImage,
  startedAt: string,
) {
  const blob = await createResultsImage(input);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${input.name.replace(/[^a-zA-Z0-9_.-]/g, "-")}-${startedAt.slice(0, 10)}-results.png`;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before releasing its source.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
