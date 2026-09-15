import { expect, test } from "bun:test";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadBenchmark } from "./load-benchmark";
import { planBenchmark } from "./plan-benchmark";
import { recordEvidence } from "./judge-evidence";
import { judgeEvalRun } from "./judge-run";
import { exportViewer } from "./export-viewer";
import { verifyViewerExport } from "./verify-viewer-export";
import { readBenchmarkRun } from "./read-run";
import { Results } from "../infra/sqlite";
import type { BenchmarkRun } from "../types";
import { queryViewerEvidence, type ViewerEvidence } from "../viewer-export";

test("a public export retains scores and citations, filters private data, and never changes the source", async () => {
  const root = await mkdtemp(
    resolve(
      process.platform === "win32" ? "C:/tmp/opencode" : tmpdir(),
      "public-viewer-",
    ),
  );
  const secret = "publication_canary_Y8xV3mQ7pR6tS2wZ";
  try {
    const project = resolve(root, "project"),
      directory = resolve(root, "results/run");
    await Bun.write(
      resolve(project, "benchmark.ts"),
      'export default {models:["local/candidate#high"],repetitions:1};',
    );
    await Bun.write(
      resolve(project, "evals/answer/prompt.md"),
      "Return READY.",
    );
    await Bun.write(
      resolve(project, "evals/answer/judge.ts"),
      `export default ({response})=>({scores:{answer:response.text==="READY"},private:{apiKey:${JSON.stringify(secret)}}});`,
    );
    const definition = await loadBenchmark(project);
    const runtime = {
      imageId: "constructed",
      candidateHash: "constructed",
      judgeHash: "constructed",
    };
    const time = new Date().toISOString();
    const benchmark: BenchmarkRun = {
      id: "benchmark_public_fixture",
      name: "Constructed export control",
      source: project,
      createdAt: time,
      updatedAt: time,
      completedAt: time,
      state: "completed",
      scheduledSlotIds: [],
      definition,
      runtime,
      execution: { startedAt: time, estimatedUSD: 0, spentUSD: 0, deferred: 0 },
    };
    {
      using results = new Results(resolve(directory, "runner.db"));
      results.saveBenchmark(benchmark);
      const slot = planBenchmark(definition, runtime, results)[0].slot;
      const started = results.startEval(slot, {
        evalId: slot.evalId,
        model: slot.model,
        repetition: 1,
        prompt: "Return READY.",
        candidateHash: slot.candidateHash,
        sourceHash: definition.evals[0].sourceHash,
        imageId: "constructed",
        timeoutMs: 1000,
        earlyStop: false,
        runtime,
      });
      const evidence = await recordEvidence({
        directory: resolve(directory, "eval-runs", started.id, "evidence"),
        prompt: "Return READY.",
        response: "READY",
      });
      const run = {
        ...started,
        state: "completed" as const,
        completedAt: time,
        elapsedMs: 0,
        evidence,
        session: {
          sessionId: "ses_control",
          database: "NEVER_PUBLISH.db",
          databaseHash: "constructed",
          opencodeVersion: "constructed-control",
          accounting: {
            costUSD: 0.125,
            sessions: 1,
            steps: 1,
            tokens: {
              input: 1,
              output: 1,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
          },
        },
      };
      await Bun.write(
        resolve(directory, "eval-runs", started.id, "session.json"),
        JSON.stringify([
          {
            info: {
              id: "ses_control",
              title: "Constructed control",
              agent: "build",
              model: { providerID: "local", id: "candidate" },
              time: { created: Date.now() },
            },
            messages: [
              {
                type: "assistant",
                id: "msg_control",
                time: { created: Date.now() },
                model: { providerID: "local", id: "candidate" },
                agent: "build",
                providerState: { opaque: "NEVER_PUBLISH_PROVIDER" },
                content: [{ type: "text", text: "READY" }],
              },
            ],
          },
        ]),
      );
      results.finishEval(run);
      expect(
        (await judgeEvalRun({ directory, definition, runtime, results }, run))
          .state,
      ).toBe("completed");
    }
    await Bun.write(resolve(directory, ".env"), `API_KEY=${secret}`);
    await Bun.write(resolve(directory, "NEVER_PUBLISH.db"), secret);
    const before = readBenchmarkRun(directory);
    const output = resolve(root, "public");
    const manifest = await exportViewer({
      directory,
      output,
      secrets: [secret],
    });
    const verified = await verifyViewerExport(output, [secret]);
    expect(verified.manifest.source.benchmarkId).toBe(benchmark.id);
    expect(Object.keys(manifest.sessions)).toHaveLength(1);
    const summary = await Bun.file(
      resolve(output, manifest.results[benchmark.id].summary.path),
    ).json();
    expect(summary.overview.scores[0].percentage).toBe(100);
    const totals = await Bun.file(
      resolve(output, manifest.modelMetrics.path),
    ).json();
    expect(totals[0].model).toBe("local/candidate#high");
    expect(totals[0].cost.reportedUSD).toBe(0.125);
    expect(totals[0].inputTokens).toBeNull();
    const judge = Object.keys(manifest.judges)[0];
    const audit = await Bun.file(
      resolve(output, manifest.judges[judge].path),
    ).json();
    expect(audit.judge.code.output.scores.answer).toBe(true);
    expect(audit.judge.code.output.private.apiKey).toContain("withheld");
    const evidence = (await Bun.file(
      resolve(output, manifest.evidence[judge][""].path),
    ).json()) as ViewerEvidence;
    expect(queryViewerEvidence(evidence, { action: "response" }).text).toBe(
      "READY",
    );
    expect(readBenchmarkRun(directory)).toEqual(before);
    expect(await readdir(output)).not.toContain("runner.db");
    expect(await readdir(output)).not.toContain(".env");
    for (const file of await readdir(resolve(output, "objects"))) {
      const text = await Bun.file(resolve(output, "objects", file)).text();
      expect(text).not.toContain(secret);
      expect(text).not.toContain("NEVER_PUBLISH");
    }
    await expect(
      exportViewer({ directory, output, secrets: [] }),
    ).rejects.toThrow("empty directory");
    await Bun.write(resolve(output, "unapproved.json"), "{}");
    await expect(verifyViewerExport(output)).rejects.toThrow("Unexpected file");
    await rm(resolve(output, "unapproved.json"));
    await Bun.write(resolve(output, manifest.index.path), "{}");
    await expect(verifyViewerExport(output)).rejects.toThrow(
      "integrity mismatch",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
