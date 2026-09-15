import { mkdir, readdir, rename, rm, rmdir, lstat, cp } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { readBenchmarkRun } from "./read-run";
import { ResultReader, evalResultId } from "./read-results";
import { readRecording } from "../infra/opencode/read-recording";
import { CandidateEvidence } from "../infra/evidence";
import { Publication } from "../infra/publishing";
import { credentialsFor } from "../infra/opencode/auth";
import { Results } from "../infra/sqlite";
import {
  mergeRuntime,
  runtimeMs,
  sumCosts,
  queryViewerEvidence,
  type EvalRunSummary,
  type ViewerAsset,
  type ViewerExport,
  type ViewerModelMetrics,
} from "../view";
import type { EvidenceQuery } from "../evidence";
import { verifyViewerExport } from "./verify-viewer-export";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function connectionSecrets(models: readonly string[]) {
  const credentials = new Map<string, string>();
  for (const model of models)
    for (const entry of credentialsFor(model as `${string}/${string}`, false))
      credentials.set(entry.id, entry.value);
  const secrets: string[] = [];
  function visit(value: unknown, key = "") {
    if (
      typeof value === "string" &&
      /key|token|secret|password|refresh|access/i.test(key) &&
      value.length >= 6
    )
      secrets.push(value);
    else if (value && typeof value === "object")
      for (const [key, entry] of Object.entries(value)) visit(entry, key);
  }
  for (const value of credentials.values()) visit(JSON.parse(value));
  return secrets;
}

export type ExportViewerOptions = {
  directory: string;
  output: string;
  /** Known secrets to check. If omitted, read the run's active provider connections. */
  secrets?: readonly string[];
  /** Only these relative UTF-8 workspace artifacts can be published. */
  artifacts?: readonly string[];
  /** Include the real, built viewer to create a standalone static site. */
  assetsPath?: string;
};

/** Allowlisted static publication from a finalized run; writes a new directory atomically. */
export async function exportViewer(
  options: ExportViewerOptions,
): Promise<ViewerExport> {
  const directory = resolve(options.directory),
    output = resolve(options.output);
  if (
    output === directory ||
    output.startsWith(directory + sep) ||
    directory.startsWith(output + sep)
  )
    throw new Error("Public output must be separate from the evidence store");
  const destination = await lstat(output).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return;
      throw error;
    },
  );
  if (
    destination &&
    (!destination.isDirectory() ||
      destination.isSymbolicLink() ||
      (await readdir(output)).length)
  )
    throw new Error("Export destination must be a new or empty directory");
  for (const path of options.artifacts ?? [])
    if (
      /(^|\/)(?:\.env(?:\.|$)|\.git\/|\.opencode\/)|\.(?:db|sqlite|sqlite3)(?:$|-)/i.test(
        path.replaceAll("\\", "/"),
      )
    )
      throw new Error(
        "Credential, configuration, and database artifacts cannot be published",
      );
  const data = readBenchmarkRun(directory);
  if (
    data.benchmark.state === "running" ||
    [...data.evals, ...data.judges].some((run) => run.state === "running")
  )
    throw new Error(
      "Wait for the benchmark and all executions to finish before exporting",
    );
  const models = [
    ...data.benchmark.definition.models,
    ...(data.benchmark.definition.judge.model
      ? [data.benchmark.definition.judge.model]
      : []),
  ];
  const secrets = options.secrets ?? connectionSecrets(models);
  const policy = new Publication(secrets);
  const activeIds = new Set(
    data.slots
      .filter((slot) => slot.active)
      .flatMap((slot) => (slot.evalRunId ? [slot.evalRunId] : [])),
  );
  const candidates = data.evals.filter((run) => activeIds.has(run.id));
  const judges = data.judges.filter((judge) =>
    activeIds.has(judge.input.evalRunId),
  );
  const staging = `${output}.staging-${crypto.randomUUID()}`;
  await mkdir(resolve(staging, "objects"), { recursive: true });
  try {
    const put = async (input: unknown): Promise<ViewerAsset> => {
      const value = policy.json(input),
        text = JSON.stringify(value) + "\n";
      policy.assertClean(text);
      const sha256 = hash(text),
        path = `objects/${sha256}.json`;
      await Bun.write(resolve(staging, path), text);
      return { path, sha256, bytes: Buffer.byteLength(text) };
    };
    const reader = new ResultReader(dirname(directory));
    const index = await reader.index();
    const entry = index.entries.find((entry) => entry.id === data.benchmark.id);
    if (!entry)
      throw new Error(
        "The selected BenchmarkRun is not independently addressable",
      );
    const manifest: ViewerExport = {
      version: 1,
      createdAt: new Date().toISOString(),
      source: {
        benchmarkId: data.benchmark.id,
        resultsSchema: 5,
        exporterVersion: (
          await Bun.file(new URL("../../package.json", import.meta.url)).json()
        ).version,
        opencodeVersions: [
          ...new Set(
            [...candidates, ...judges].flatMap((run) =>
              run.session ? [run.session.opencodeVersion] : [],
            ),
          ),
        ],
      },
      index: await put({
        public: true,
        root: "Recorded results",
        entries: [entry],
        warnings: [],
      }),
      results: {},
      sessions: {},
      judges: {},
      evidence: {},
      modelMetrics: {} as ViewerAsset,
      overview: {} as ViewerAsset,
      redactions: {},
    };
    const summary = await reader.summary(data.benchmark.id);
    manifest.results[data.benchmark.id] = { summary: await put(summary) };
    const allRuns: EvalRunSummary[] = [];
    const evalSummaries: Record<
      string,
      Awaited<ReturnType<ResultReader["summary"]>>
    > = {};
    for (const definition of data.benchmark.definition.evals) {
      const id = evalResultId(data.benchmark.id, definition.id);
      const runs = await reader.evalRuns(id);
      allRuns.push(...runs.runs);
      evalSummaries[definition.id] = await reader.summary(id);
      manifest.results[id] = {
        summary: await put(evalSummaries[definition.id]),
        runs: await put(runs),
      };
    }
    using results = new Results(resolve(directory, "runner.db"), true);
    for (const run of [...candidates, ...judges]) {
      if (!run.session) continue;
      const records = [];
      let after = 0;
      for (;;) {
        const page = results.events(run.id, after);
        if (!page.length) break;
        records.push(...page.map((row) => row.record));
        after = page.at(-1)!.sequence;
      }
      manifest.sessions[run.id] = await put(
        policy.session(await readRecording(directory, run, records)),
      );
    }
    const evidence = new Map<
      string,
      {
        asset: ViewerAsset;
        data: Awaited<ReturnType<CandidateEvidence["viewerData"]>>;
      }
    >();
    for (const judge of judges) {
      const audit = await reader.judgeAudit(data.benchmark.id, judge.id);
      manifest.judges[judge.id] = await put(audit);
      const checks = [
        { id: "", reference: judge.input.evidence },
        ...data.checks
          .filter((check) => check.judgeRunId === judge.id)
          .map((check) => ({ id: check.id, reference: check.checkpoint })),
      ];
      manifest.evidence[judge.id] = {};
      for (const check of checks) {
        let saved = evidence.get(check.reference.hash);
        if (!saved) {
          const source = await CandidateEvidence.open(
            resolve(directory, check.reference.directory),
            check.reference.hash,
          );
          const published = policy.evidence(
            await source.viewerData(options.artifacts),
          );
          saved = { data: published, asset: await put(published) };
          evidence.set(check.reference.hash, saved);
        }
        manifest.evidence[judge.id][check.id] = saved.asset;
      }
      // Every final citation must resolve against the public data, including code judgments.
      const saved = evidence.get(judge.input.evidence.hash)!.data;
      for (const score of Object.values(judge.judgment?.scores ?? {}))
        for (const citation of score.evidence) {
          const query: EvidenceQuery =
            citation.kind === "recording"
              ? { action: "summary" }
              : citation.kind === "metric"
                ? { action: "metrics", metric: citation.id }
                : {
                    action: citation.kind,
                    ...("id" in citation ? { id: citation.id } : {}),
                    ...("path" in citation
                      ? { path: citation.path, revision: citation.revision }
                      : {}),
                  };
          queryViewerEvidence(saved, query);
        }
    }
    const modelMetrics: ViewerModelMetrics[] =
      data.benchmark.definition.models.map((model) => {
        const [modelId, variant = "default"] = model.split("#");
        const runs = allRuns.filter(
          (run) => run.model === modelId && run.reasoning === variant,
        );
        const metrics = candidates
          .filter((run) => run.input.model === model)
          .map((run) => run.metrics);
        const measured = metrics.length > 0 && metrics.length === runs.length;
        return {
          model,
          cost: sumCosts(runs.map((run) => run.cost)),
          toolCalls:
            measured && metrics.every(Boolean)
              ? metrics.reduce((sum, metric) => sum + metric!.tools.calls, 0)
              : null,
          inputTokens:
            measured && metrics.every((metric) => metric?.tokens)
              ? metrics.reduce((sum, metric) => sum + metric!.tokens!.input, 0)
              : null,
          outputTokens:
            measured && metrics.every((metric) => metric?.tokens)
              ? metrics.reduce((sum, metric) => sum + metric!.tokens!.output, 0)
              : null,
          durationMs: runtimeMs(
            mergeRuntime(
              runs.flatMap((run) => [
                ...run.eval.runtime,
                ...run.judge.runtime,
              ]),
            ),
            Date.now(),
          ),
        };
      });
    manifest.modelMetrics = await put(modelMetrics);
    const overview =
      JSON.stringify(
        policy.json({
          repetitions: data.benchmark.definition.repetitions,
          summary,
          evals: evalSummaries,
          metrics: modelMetrics,
        }),
      ) + "\n";
    policy.assertClean(overview);
    await Bun.write(resolve(staging, "overview.json"), overview);
    manifest.overview = {
      path: "overview.json",
      sha256: hash(overview),
      bytes: Buffer.byteLength(overview),
    };
    manifest.redactions = { ...policy.redactions };
    const text = JSON.stringify(manifest, null, 2) + "\n";
    policy.assertClean(text);
    await Bun.write(resolve(staging, "manifest.json"), text);
    if (options.assetsPath) {
      const assets = resolve(options.assetsPath);
      const html = await Bun.file(resolve(assets, "index.html")).text();
      await cp(resolve(assets, "assets"), resolve(staging, "assets"), {
        recursive: true,
      });
      await Bun.write(
        resolve(staging, "index.html"),
        html.replace(
          "</head>",
          '<script id="openeval-source" type="application/json">{"manifest":"./manifest.json"}</script></head>',
        ),
      );
    }
    await verifyViewerExport(staging, secrets);
    await mkdir(dirname(output), { recursive: true });
    if (destination) await rmdir(output);
    await rename(staging, output);
    return manifest;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
