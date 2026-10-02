import { createSignal } from "solid-js";
import type { CostTotal, ModelNames } from "@hona/openeval/view";

const [catalogNames, setCatalogNames] = createSignal<ModelNames>({});
/** Use the OpenCode catalog names recorded with the displayed result. */
export const setModelNames = (names: ModelNames | undefined) =>
  setCatalogNames(names ?? {});

/** Readable fallback for results recorded without a catalog name. */
const guessedName = (ref: string) => {
  const id = ref.slice(ref.indexOf("/") + 1).split("#")[0];
  return id
    .replace(/^omen-alpha$/i, "Omen Alpha")
    .replace(/^big-pickle$/i, "Big Pickle")
    .replace(/^gpt-/i, "GPT-")
    .replace(/^gemini-/, "Gemini ")
    .replace(/^grok-/, "Grok ")
    .replace(/^deepseek-v(\d+)-pro-(\d+)$/, "DeepSeek V$1 Pro $2")
    .replace(
      /^deepseek-v(\d+(?:\.\d+)?)-flash(?:-expires-on-\d+)?$/,
      "DeepSeek V$1 Flash",
    )
    .replace(/^glm-/, "GLM-")
    .replace(/^muse-spark-/, "Muse Spark ")
    .replace(/^claude-fable-(\d+)-(\d+)$/, "Claude Fable $1.$2")
    .replace(/-astra$/, " Astra")
    .replace(/-luna$/, " Luna")
    .replace(/-pro-preview$/, " Pro Preview")
    .replace(/-flash$/, " Flash");
};
export const modelName = (ref: string) =>
  catalogNames()[ref.split("#")[0]] ?? guessedName(ref);
export const provider = (ref: string) =>
  /deepseek/.test(ref)
    ? "deepseek"
    : /glm/.test(ref)
      ? "zai"
      : /grok/.test(ref)
        ? "xai"
        : /gpt|o[134]-/.test(ref)
          ? "openai"
          : /gemini/.test(ref)
            ? "google"
            : /claude/.test(ref)
              ? "anthropic"
              : /muse|llama/.test(ref)
                ? "llama"
                : ref.split("/")[0];
export const reasoning = (ref: string) => ref.split("#")[1] ?? "default";
export const modelGroup = (ref: string) => {
  const id = ref
    .slice(ref.indexOf("/") + 1)
    .split("#")[0]
    .toLowerCase();
  const groups: Array<[RegExp, string, string]> = [
    [/^big-pickle$/, "OpenCode Zen", "Big Pickle"],
    [/^omen-/, "OpenCode Go", "Omen"],
    [/^gemini-/, "Google", "Gemini"],
    [/^gpt-/, "OpenAI", "GPT"],
    [/^o\d(?:-|$)/, "OpenAI", "o-series"],
    [/^claude-/, "Anthropic", "Claude"],
    [/^muse-/, "Meta", "Muse"],
    [/^llama-/, "Meta", "Llama"],
    [/^deepseek-/, "DeepSeek", "DeepSeek"],
    [/^glm-/, "Z.ai", "GLM"],
    [/^grok-/, "xAI", "Grok"],
    [/^qwen/, "Alibaba", "Qwen"],
    [/^kimi/, "Moonshot AI", "Kimi"],
    [/^(?:mistral|devstral|codestral|magistral)/, "Mistral AI", "Mistral"],
    [/^minimax/, "MiniMax", "MiniMax"],
  ];
  const found = groups.find(([pattern]) => pattern.test(id));
  return {
    lab: found?.[1] ?? ref.split("/")[0],
    family: found?.[2] ?? id.split("-")[0],
  };
};
export const matchesModelFilters = (ref: string, filters: string[]) => {
  if (!filters.length) return true;
  const group = modelGroup(ref);
  return (
    filters.includes(`lab:${group.lab}`) ||
    filters.includes(`family:${group.family}`)
  );
};
export const formatNumber = (value: number | null) =>
  value === null ? "—" : Number(value.toFixed(2)).toString();
export const formatPercent = (value: number | null) =>
  value === null ? "Pending" : `${formatNumber(value)}%`;
export const formatCost = (value: number | null | undefined) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: Math.abs(value) >= 1 ? 2 : 4,
      }).format(value);
/** A cost total with a note when some runs have no final cost, so the total is a lower bound. */
export const formatCostTotal = (
  cost: CostTotal | undefined,
  running: boolean,
): { label: string; note?: string } => {
  if (!cost) return { label: "—" };
  if (cost.complete) return { label: formatCost(cost.usd) };
  const runs =
    cost.unaccounted === 1
      ? "1 run has"
      : cost.unaccounted
        ? `${cost.unaccounted} runs have`
        : "Some runs have";
  return running
    ? {
        label: formatCost(cost.reportedUSD),
        note: `Recorded spend so far. ${runs} no final cost yet.`,
      }
    : {
        label: `≥ ${formatCost(cost.reportedUSD)}`,
        note: `Recorded spend. ${runs} no final cost, so the total can be higher.`,
      };
};
export const formatDate = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
export const duration = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  return seconds < 60
    ? `${(ms / 1000).toFixed(1)}s`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
      : `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s`;
};
export const stateLabel = (status: string) =>
  ({
    waiting: "Waiting",
    watching: "Watching evidence",
    stopped: "Stopped early",
    blocked: "Blocked",
    timed_out: "Timed out",
    queued: "Queued",
    in_progress: "In progress",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
    interrupted: "Interrupted",
  })[status] ?? status;
