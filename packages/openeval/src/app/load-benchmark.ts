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
import { CANDIDATE_TIMEOUT_MS, MAX_CANDIDATE_TIMEOUT_MS } from "../types";
import { rubricCriteria } from "../judgment";
import {
  categoryKey,
  categoryList,
  rubricCategories,
} from "../criterion-categories";
import { compileCodeJudge } from "../infra/judging/code-source";
import { readCodeCriteria } from "../infra/judging/code-criteria";
import { RUNTIME_IMAGE } from "../infra/opencode/version";
import { monitorPolicy } from "./monitor-policy";
import {
  fingerprint,
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
const timeLimit = (value: unknown, label: string) => {
  const timeoutMs = positive(value, CANDIDATE_TIMEOUT_MS, label);
  if (timeoutMs > MAX_CANDIDATE_TIMEOUT_MS)
    throw new Error(`${label} cannot exceed 12 hours`);
  return timeoutMs;
};
export const modelRef = (value: unknown): ModelRef => {
  if (
    typeof value !== "string" ||
    !/^[\w.-]+\/[^\s/#]+(?:\/[^\s/#]+)*(?:#[\w.-]+)?$/.test(value)
  )
    throw new Error(`Invalid model reference: ${String(value)}`);
  return value as ModelRef;
};
/** Bun caches modules by path, ignoring URL queries; clear the entry so edits load. */
async function freshModule(path: string): Promise<Record<string, unknown>> {
  delete require.cache[path];
  return import(pathToFileURL(path).href);
}
async function declaration<T>(path: string): Promise<T> {
  return (await freshModule(path)).default as T;
}
async function loadEval(directory: string): Promise<EvalDefinition> {
  const id = basename(directory),
    prompt = Bun.file(resolve(directory, "prompt.md")),
    judge = Bun.file(resolve(directory, "judge.md")),
    codeFile = resolve(directory, "judge.ts");
  const hasMarkdown = await judge.exists(),
    hasCode = await Bun.file(codeFile).exists();
  if (!(await prompt.exists()) || (!hasMarkdown && !hasCode))
    throw new Error(
      `${id} requires prompt.md and at least one of judge.md or judge.ts`,
    );
  const settings = (await Bun.file(resolve(directory, "eval.ts")).exists())
    ? await declaration<Eval>(resolve(directory, "eval.ts"))
    : {};
  if (!settings || typeof settings !== "object")
    throw new Error(`${id}/eval.ts must export a declaration`);
  if (
    Object.keys(settings).some(
      (key) =>
        !["workspace", "prepare", "earlyStop", "candidate"].includes(key),
    )
  )
    throw new Error(`${id}/eval.ts has unsupported settings`);
  if (settings.candidate !== undefined) {
    const candidate: unknown = settings.candidate;
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate) ||
      Object.keys(candidate).some((key) => key !== "timeoutMs")
    )
      throw new Error(`${id}: candidate contains unsupported settings`);
    if (settings.candidate.timeoutMs !== undefined)
      timeLimit(settings.candidate.timeoutMs, `${id}: candidate timeout`);
  }
  monitorPolicy(settings.earlyStop);
  if (hasCode && settings.earlyStop)
    throw new Error(
      `${id}: judge.ts grades finalized recordings; earlyStop requires a Markdown-only judge`,
    );
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
    rubric = rubricCategories(hasMarkdown ? await judge.text() : ""),
    judgeText = rubric.rubric;
  if (!promptText.trim() || (hasMarkdown && !judgeText.trim()))
    throw new Error(`${id}: prompt and judge must not be empty`);
  const code = hasCode ? await compileCodeJudge(codeFile) : undefined;
  const criteria = hasMarkdown ? rubricCriteria(judgeText) : [];
  const declared = hasCode ? await codeCriteria(id, codeFile) : [];
  if (declared.some((item) => criteria.some(({ id }) => id === item.id)))
    throw new Error(
      `${id}: declare each criterion in either judge.md or judge.ts, not both`,
    );
  const categories = Object.fromEntries(
    [
      ...Object.entries(rubric.categories),
      ...declared.map((item) => [item.id, item.categories] as const),
    ].filter(([, names]) => names.length),
  );
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
    judgeHash: fingerprint({ rubric: judgeText, code: code?.hash }),
    criteria,
    ...(declared.length
      ? { codeCriteria: declared.map(({ id, name }) => ({ id, name })) }
      : {}),
    ...(Object.keys(categories).length ? { categories } : {}),
    ...(code ? { code } : {}),
    name: /^# (.+)$/m.exec(judgeText)?.[1] ?? id,
  };
}

/** Reads judge.ts's optional `criteria` export as data; planning never executes judge code. */
async function codeCriteria(id: string, path: string) {
  const declared = await readCodeCriteria(path);
  if (declared === undefined) return [];
  if (!declared || typeof declared !== "object" || Array.isArray(declared))
    throw new Error(`${id}/judge.ts criteria must be an object`);
  return Object.entries(declared).map(([criterion, value]) => {
    const where = `${id}/judge.ts criterion ${criterion}`;
    if (!/^[a-z][a-z0-9_]*$/.test(criterion))
      throw new Error(`${where}: use a lowercase snake_case ID`);
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !["name", "categories"].includes(key))
    )
      throw new Error(`${where}: declare only name and categories`);
    const { name, categories = [] } = value as {
      name?: unknown;
      categories?: unknown;
    };
    if (name !== undefined && (typeof name !== "string" || !name.trim()))
      throw new Error(`${where}: name must be a non-empty string`);
    if (!Array.isArray(categories))
      throw new Error(`${where}: categories must be an array`);
    return {
      id: criterion,
      name: (name as string | undefined)?.trim() ?? criterion.replaceAll("_", " "),
      categories: categoryList(categories, where),
    };
  });
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
    !definition.models.length
  )
    throw new Error("benchmark.ts requires models");
  if (
    Object.keys(definition).some(
      (key) =>
        ![
          "name",
          "suite",
          "models",
          "judge",
          "repetitions",
          "concurrency",
          "candidate",
          "container",
          "categories",
        ].includes(key),
    )
  )
    throw new Error("benchmark.ts contains unsupported settings");
  if (
    definition.suite !== undefined &&
    (typeof definition.suite !== "string" ||
      !definition.suite.trim() ||
      definition.suite.length > 80)
  )
    throw new Error("benchmark.ts suite must be a label of 1 to 80 characters");
  if (
    definition.categories !== undefined &&
    (!Array.isArray(definition.categories) || !definition.categories.length)
  )
    throw new Error("benchmark.ts categories must be a non-empty array");
  const categories = definition.categories
    ? categoryList(definition.categories, "benchmark.ts")
    : undefined;
  const models = definition.models.map(modelRef);
  if (
    definition.judge !== undefined &&
    (!definition.judge ||
      typeof definition.judge !== "object" ||
      Array.isArray(definition.judge) ||
      Object.keys(definition.judge).some(
        (key) => !["model", "timeoutMs", "websearch", "verification"].includes(key),
      ))
  )
    throw new Error(
      "judge must be an object with model, timeoutMs, websearch, or verification settings",
    );
  if (new Set(models).size !== models.length)
    throw new Error("Benchmark contains duplicate models");
  const timeoutMs = timeLimit(
    definition.candidate?.timeoutMs,
    "Candidate timeout",
  );
  const evalRoot = resolve(directory, "evals");
  const directories = (await readdir(evalRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!directories.length) throw new Error("Benchmark has no eval folders");
  const declared = await Promise.all(
    directories.map((entry) => loadEval(resolve(evalRoot, entry.name))),
  );
  const keys = categories?.map(categoryKey);
  const evals = keys
    ? declared.filter((item) =>
        Object.values(item.categories ?? {}).some((names) =>
          names.some((name) => keys.includes(categoryKey(name))),
        ),
      )
    : declared;
  if (!evals.length)
    throw new Error(
      `No criteria match the benchmark categories: ${categories!.join(", ")}`,
    );
  if (evals.some((item) => item.judge) && !definition.judge?.model)
    throw new Error("A benchmark containing judge.md requires judge.model");
  const concurrency = positive(definition.concurrency, 10, "Concurrency");
  if (concurrency < 2 && evals.some((item) => item.settings.earlyStop))
    throw new Error(
      "Early stopping requires concurrency of at least 2 for eval and judge work",
    );
  const engine = definition.container?.engine ?? "docker";
  if (engine !== "docker" && engine !== "podman")
    throw new Error("Container engine must be docker or podman");
  const verification = definition.judge?.verification;
  if (verification && (
    typeof verification !== "object" || Array.isArray(verification) ||
    Object.keys(verification).some(key => !["image", "engine", "cpus", "memoryMiB"].includes(key)) ||
    typeof verification.image !== "string" || !verification.image.trim() || /\s/.test(verification.image) ||
    !["docker", "podman"].includes(verification.engine ?? engine)
  )) throw new Error("judge.verification requires an image and valid container limits");
  for (const search of [
    definition.candidate?.websearch,
    definition.judge?.websearch,
  ])
    if (search !== undefined && search !== false && search !== "exa")
      throw new Error("Websearch must be exa or false");
  return {
    name: definition.name ?? basename(directory),
    ...(definition.suite ? { suite: definition.suite.trim() } : {}),
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
      ...(definition.judge?.model
        ? { model: modelRef(definition.judge.model) }
        : {}),
      timeoutMs: positive(
        definition.judge?.timeoutMs,
        600_000,
        "Judge timeout",
      ),
      websearch: definition.judge?.websearch ?? "exa",
      ...(verification ? { verification: {
        image: verification.image,
        engine: verification.engine ?? engine,
        cpus: positive(verification.cpus, 2, "Verification CPU count"),
        memoryMiB: positive(verification.memoryMiB, 4096, "Verification memory"),
      } } : {}),
    },
    container: {
      engine,
      image: definition.container?.image ?? RUNTIME_IMAGE,
      cpus: positive(definition.container?.cpus, 2, "CPU count"),
      memoryMiB: positive(definition.container?.memoryMiB, 4096, "Memory"),
    },
    ...(categories ? { categories } : {}),
  };
}
