import { readdir, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  Benchmark,
  BenchmarkDefinition,
  Eval,
  EvalDefinition,
  ModelRef,
} from "../types";
import { CANDIDATE_TIMEOUT_MS } from "../types";
import { rubricMetrics } from "../judgment";
import { monitorPolicy } from "./monitor-policy";
import {
  fingerprint,
  hash,
  relativePath,
  treeHash,
  contained,
} from "../infra/files";

const positive = (value: unknown, fallback: number, label: string) => {
  const result = value ?? fallback;
  if (typeof result !== "number" || !Number.isInteger(result) || result < 1)
    throw new Error(`${label} must be a positive integer`);
  return result;
};
export const modelRef = (value: unknown): ModelRef => {
  if (
    typeof value !== "string" ||
    !/^[\w.-]+\/[^\s/#]+(?:#[\w.-]+)?$/.test(value)
  )
    throw new Error(`Invalid model reference: ${String(value)}`);
  return value as ModelRef;
};
async function declaration<T>(path: string): Promise<T> {
  const url = pathToFileURL(path);
  url.searchParams.set("version", hash(await Bun.file(path).bytes()));
  return (await import(url.href)).default;
}
async function loadEval(directory: string): Promise<EvalDefinition> {
  const id = basename(directory),
    prompt = Bun.file(resolve(directory, "prompt.md")),
    judge = Bun.file(resolve(directory, "judge.md"));
  if (!(await prompt.exists()) || !(await judge.exists()))
    throw new Error(`${id} requires prompt.md and judge.md`);
  const settings = (await Bun.file(resolve(directory, "eval.ts")).exists())
    ? await declaration<Eval>(resolve(directory, "eval.ts"))
    : {};
  if (!settings || typeof settings !== "object")
    throw new Error(`${id}/eval.ts must export a declaration`);
  if (
    Object.keys(settings).some(
      (key) => !["workspace", "prepare", "earlyStop"].includes(key),
    )
  )
    throw new Error(`${id}/eval.ts has unsupported settings`);
  monitorPolicy(settings.earlyStop);
  const source: unknown[] = [];
  if (settings.workspace) {
    const workspace = settings.workspace;
    if (
      Object.keys(workspace).some(
        (key) =>
          ![
            "repository",
            "revisions",
            "ref",
            "commit",
            "checkout",
            "remote",
            "overlay",
          ].includes(key),
      )
    )
      throw new Error(`${id}: workspace contains unsupported settings`);
    if (!/^[\w./-]+$/.test(workspace.ref))
      throw new Error(`${id}: workspace ref is invalid`);
    if (workspace.commit && !/^[a-f0-9]{40}$/.test(workspace.commit))
      throw new Error(`${id}: workspace commit must be a full SHA`);
    if (
      [workspace.repository, workspace.revisions].filter(Boolean).length !== 1
    )
      throw new Error(
        `${id}: choose one workspace source: repository or revisions`,
      );
    if (workspace.repository) {
      const url = new URL(workspace.repository);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !workspace.commit
      )
        throw new Error(
          `${id}: repository requires a credential-free HTTPS URL and a full commit SHA`,
        );
      source.push({
        repository: workspace.repository,
        commit: workspace.commit,
      });
    }
    if (workspace.revisions) {
      if (
        !workspace.revisions.length ||
        !workspace.revisions.some((revision) => revision.ref === workspace.ref)
      )
        throw new Error(`${id}: revisions must include the initial ref`);
      for (const revision of workspace.revisions) {
        if (
          !/^[\w.-]+$/.test(revision.ref) ||
          revision.ref === "preparation" ||
          !revision.message
        )
          throw new Error(`${id}: invalid revision ref/message`);
        source.push(
          await treeHash(
            contained(
              directory,
              relativePath(revision.directory, "Revision files"),
            ),
          ),
        );
      }
    }
    if (workspace.overlay)
      source.push(
        await treeHash(
          contained(
            directory,
            relativePath(workspace.overlay, "Workspace overlay"),
          ),
        ),
      );
    for (const name of [
      workspace.checkout ?? "checkout",
      workspace.remote ?? "upstream",
    ])
      if (!/^[\w-]+$/.test(name))
        throw new Error(`${id}: checkout and remote must be simple names`);
  } else {
    const workspace = resolve(directory, "workspace");
    if (
      await stat(workspace)
        .then((s) => s.isDirectory())
        .catch(() => false)
    )
      source.push(await treeHash(workspace));
  }
  for (const step of settings.prepare ?? []) {
    relativePath(step.cwd, "Preparation working directory");
    if (
      !Array.isArray(step.argv) ||
      !step.argv.length ||
      step.argv.some((arg) => typeof arg !== "string" || !arg)
    )
      throw new Error(`${id}: preparation requires argv`);
  }
  const promptText = await prompt.text(),
    judgeText = await judge.text();
  if (!promptText.trim() || !judgeText.trim())
    throw new Error(`${id}: prompt and judge must not be empty`);
  return {
    id,
    directory,
    prompt: promptText,
    judge: judgeText,
    settings,
    sourceHash: fingerprint({
      settings: { workspace: settings.workspace, prepare: settings.prepare },
      source,
    }),
    judgeHash: hash(judgeText),
    metrics: rubricMetrics(judgeText),
    name: /^# (.+)$/m.exec(judgeText)?.[1] ?? id,
  };
}

export async function loadBenchmark(
  path: string,
): Promise<BenchmarkDefinition> {
  const directory = resolve(
    path.endsWith("benchmark.ts") ? resolve(path, "..") : path,
  );
  const declarationFile = resolve(directory, "benchmark.ts");
  const definition = await declaration<Benchmark>(declarationFile);
  if (
    !definition ||
    !Array.isArray(definition.models) ||
    !definition.models.length ||
    !definition.judge
  )
    throw new Error("benchmark.ts requires models and a judge");
  if (
    Object.keys(definition).some(
      (key) =>
        ![
          "name",
          "models",
          "judge",
          "repetitions",
          "concurrency",
          "candidate",
          "container",
        ].includes(key),
    )
  )
    throw new Error("benchmark.ts contains unsupported settings");
  const models = definition.models.map(modelRef);
  if (new Set(models).size !== models.length)
    throw new Error("Benchmark contains duplicate models");
  const timeoutMs = positive(
    definition.candidate?.timeoutMs,
    CANDIDATE_TIMEOUT_MS,
    "Candidate timeout",
  );
  if (timeoutMs > CANDIDATE_TIMEOUT_MS)
    throw new Error("Candidate timeout cannot exceed 45 minutes");
  const evalRoot = resolve(directory, "evals");
  const directories = (await readdir(evalRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!directories.length) throw new Error("Benchmark has no eval folders");
  const evals = await Promise.all(
    directories.map((entry) => loadEval(resolve(evalRoot, entry.name))),
  );
  const concurrency = positive(definition.concurrency, 10, "Concurrency");
  if (concurrency < 2 && evals.some((item) => item.settings.earlyStop))
    throw new Error(
      "Early stopping requires concurrency of at least 2 for eval and judge work",
    );
  const engine = definition.container?.engine ?? "docker";
  if (engine !== "docker" && engine !== "podman")
    throw new Error("Container engine must be docker or podman");
  for (const search of [
    definition.candidate?.websearch,
    definition.judge.websearch,
  ])
    if (search !== undefined && search !== false && search !== "exa")
      throw new Error("Websearch must be exa or false");
  return {
    name: definition.name ?? basename(directory),
    directory,
    models,
    evals,
    repetitions: positive(definition.repetitions, 3, "Repetitions"),
    concurrency,
    candidate: {
      timeoutMs,
      websearch: definition.candidate?.websearch ?? "exa",
      ...(definition.candidate?.providers
        ? { providers: definition.candidate.providers }
        : {}),
    },
    judge: {
      model: modelRef(definition.judge.model),
      timeoutMs: positive(definition.judge.timeoutMs, 600_000, "Judge timeout"),
      websearch: definition.judge.websearch ?? "exa",
    },
    container: {
      engine,
      image: definition.container?.image ?? "openeval-runtime:0.2",
      cpus: positive(definition.container?.cpus, 2, "CPU count"),
      memoryMiB: positive(definition.container?.memoryMiB, 4096, "Memory"),
    },
  };
}
