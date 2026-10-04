import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { OpenCode } from "@opencode/sdk";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import type { BenchmarkDefinition, BenchmarkRun, Slot } from "../types";
import { hash } from "../infra/files";
import { Results } from "../infra/sqlite";
import { readBenchmarkRun, readEvidence } from "./read-run";
import { restoreEvalRun } from "./restore-eval-run";
import { verifyArchivedInput } from "../infra/restore-archive";

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "restore-eval-"));
  const initial = resolve(root, "inputs/answer/source/workspace");
  const final = resolve(root, "final");
  await mkdir(initial, { recursive: true });
  await mkdir(final);
  await Bun.write(resolve(initial, "answer.txt"), "initial");
  await Bun.write(resolve(initial, "../ready"), "ready");
  await Bun.write(resolve(final, "answer.txt"), "final");
  const prompt = "Supply the requested fact.";
  const model = { providerID: "local", id: "fixture", variant: "high" };
  const database = resolve(root, "backup.db");
  const now = Date.now();
  let sessionId: string;
  let archived: Parameters<typeof verifyArchivedInput>[2];
  {
    await using host = await OpenCode.create({
      database: { path: database },
      config: { directory: resolve(root, "config"), project: false, content: JSON.stringify({ websearch: false }) },
      plugins: [{ id: "no-model-calls", async setup(context) {
        await context.session.hook("http.request", () => { throw new Error("Tests must not call models"); });
      } }],
    });
    const seed = await host.session.create({ location: { directory: root }, model, agent: "build" });
    const imported = await host.session.import({
      info: { ...seed, id: "ses_restore_fixture", outcome: "succeeded", time: { ...seed.time, idle: now } },
      messages: [
        { id: "msg_prompt", type: "user", text: prompt, time: { created: now } },
        { id: "msg_answer", type: "assistant", agent: "build", model, finish: "stop",
          content: [{ type: "text", text: "READY" }], time: { created: now, completed: now } },
      ],
    });
    sessionId = imported.id;
    archived = { outcome: "succeeded", result: { state: "completed", text: "READY", tools: [],
      sessions: [{ info: imported, messages: await host.session.context({ sessionID: sessionId }) }] } };
  }
  {
    using db = new Database(database);
    db.exec("INSERT INTO credential (id,integration_id,label,value,active,time_created,time_updated) VALUES ('secret','local','fixture','{\"key\":\"fixture-secret\"}',1,1,1)");
  }
  const workspaceArchive = resolve(root, "workspace.tar");
  const tar = Bun.spawn(["tar", "-cf", workspaceArchive, "-C", final, "."], { stdout: "ignore", stderr: "pipe" });
  if (await tar.exited) throw new Error(await new Response(tar.stderr).text());
  const definition: BenchmarkDefinition = {
    name: "SDK fixture", directory: root, models: ["local/fixture#high"], repetitions: 1, concurrency: 1,
    candidate: { timeoutMs: 1000, websearch: false }, judge: { model: "local/judge", timeoutMs: 1000, websearch: false },
    container: { engine: "docker", image: "fixture", cpus: 1, memoryMiB: 1024 },
    evals: [{ id: "answer", name: "Answer", directory: root, prompt, judge: "", judgeHash: "judge",
      sourceHash: "source", settings: {}, criteria: [] }],
  };
  const runtime: BenchmarkRun["runtime"] = { imageId: "fixture", candidateHash: "runtime", judgeHash: "judge" };
  const slot: Slot = { id: "answer:local/fixture#high:1", evalId: "answer", model: "local/fixture#high",
    repetition: 1, candidateHash: "candidate", judgeHash: "judge", active: true, evalRunId: null, judgeRunId: null };
  let evalRunId: string;
  {
    using results = new Results(resolve(root, "runner.db"));
    results.saveBenchmark({ id: "benchmark_fixture", name: "SDK fixture", source: root, definition, runtime,
      createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), state: "failed", scheduledSlotIds: [],
      execution: { startedAt: new Date(now).toISOString(), estimatedUSD: 0, spentUSD: 0, deferred: 0 } });
    const run = results.startEval(slot, { evalId: "answer", model: slot.model, repetition: 1, prompt,
      candidateHash: "candidate", sourceHash: "source", imageId: "fixture", timeoutMs: 1000, earlyStop: false, runtime });
    results.finishEval({ ...run, state: "failed", interrupted: true, error: "Runner stopped",
      completedAt: new Date(now).toISOString(), elapsedMs: 0 });
    evalRunId = run.id;
  }
  await Bun.write(resolve(root, "eval-runs", evalRunId, "evidence/events.jsonl"),
    JSON.stringify({ event: { type: "session.created", data: { sessionID: sessionId } } }) + "\n");
  return { root, evalRunId, database, sessionId, archived, options: {
    database, databaseHash: hash(await Bun.file(database).bytes()),
    workspaceArchive, workspaceArchiveHash: hash(await Bun.file(workspaceArchive).bytes()),
  } };
}

test("restore retains the interrupted record, scrubs a copy, and selects the completed native evidence", async () => {
  const f = await fixture();
  try {
    const before = readBenchmarkRun(f.root);
    expect(() => verifyArchivedInput(before.evals[0].input, f.sessionId, f.archived)).not.toThrow();
    expect(() => verifyArchivedInput({ ...before.evals[0].input, prompt: "Different task" }, f.sessionId, f.archived)).toThrow("model, and prompt");
    expect(() => verifyArchivedInput({ ...before.evals[0].input, model: "local/other#high" }, f.sessionId, f.archived)).toThrow("model, and prompt");
    expect(() => verifyArchivedInput(before.evals[0].input, "wrong-session", f.archived)).toThrow("original session");
    expect(() => verifyArchivedInput(before.evals[0].input, f.sessionId, { ...f.archived, outcome: "interrupted" })).toThrow("naturally completed");
    const restored = await restoreEvalRun(f.root, f.evalRunId, f.options);
    const after = readBenchmarkRun(f.root);
    expect(after.evals.find(run => run.id === f.evalRunId)).toEqual(before.evals[0]);
    expect(restored).toMatchObject({ state: "completed", replaces: f.evalRunId,
      restoration: { evalRunId: f.evalRunId, databaseHash: f.options.databaseHash } });
    expect(restored.input).toEqual(before.evals[0].input);
    expect(after.benchmark.definition).toEqual(before.benchmark.definition);
    expect(after.slots[0].evalRunId).toBe(restored.id);
    expect(after.judges).toHaveLength(0);
    expect(hash(await Bun.file(f.database).bytes())).toBe(f.options.databaseHash);
    expect(hash(await Bun.file(f.options.workspaceArchive).bytes())).toBe(f.options.workspaceArchiveHash);
    using copied = new Database(resolve(f.root, restored.session!.database), { readonly: true });
    expect(copied.query("SELECT COUNT(*) AS n FROM credential").get()).toEqual({ n: 0 });
    const evidence = await readEvidence({ ...restored.evidence!, directory: resolve(f.root, restored.evidence!.directory) });
    expect((await evidence.query({ action: "response" })).text).toBe("READY");
    expect((await evidence.query({ action: "artifact", path: "answer.txt", revision: "final" })).text).toBe("final");
    await expect(restoreEvalRun(f.root, f.evalRunId, f.options)).rejects.toThrow("active interrupted");
  } finally { await rm(f.root, { recursive: true, force: true }); }
}, 30_000);

test("restore rejects a changed backup and a live BenchmarkRun without changing selections", async () => {
  const f = await fixture();
  try {
    const before = readBenchmarkRun(f.root);
    await expect(restoreEvalRun(f.root, f.evalRunId, { ...f.options, databaseHash: "0".repeat(64) })).rejects.toThrow("hash");
    expect(readBenchmarkRun(f.root).slots).toEqual(before.slots);
    {
      using results = new Results(resolve(f.root, "runner.db"));
      results.saveBenchmark({ ...results.benchmark!, state: "running" });
    }
    await expect(restoreEvalRun(f.root, f.evalRunId, f.options)).rejects.toThrow("active BenchmarkRun");
    expect(readBenchmarkRun(f.root).slots).toEqual(before.slots);
  } finally { await rm(f.root, { recursive: true, force: true }); }
}, 30_000);
