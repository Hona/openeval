import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { renameSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { EvalRun } from "../types";
import { Results } from "../infra/sqlite";
import * as archive from "../infra/restore-archive";
import type { ArchiveRestore } from "../infra/restore-archive";
import { measureRecording } from "../infra/recording/metrics";

/** Restore completed orphan work as a new record; retain the failed coordinator record. */
export async function restoreEvalRun(
  directory: string,
  evalRunId: string,
  options: ArchiveRestore,
): Promise<EvalRun> {
  const root = resolve(directory);
  using results = new Results(resolve(root, "runner.db"));
  const previous = results.evalRun(evalRunId);
  const slot = previous && results.slot(previous.slotId);
  const original = previous?.restoration
    ? results.evalRun(previous.restoration.evalRunId)
    : previous;
  if (!previous || !slot || !slot.active || slot.evalRunId !== previous.id ||
      !original || original.state !== "failed" || !original.interrupted || original.evidence ||
      (previous !== original && (previous.state !== "completed" || !previous.restoration)))
    throw new Error("Select an active interrupted EvalRun or its restored recording");
  if (previous.restoration && (options.databaseHash !== previous.restoration.databaseHash ||
      options.workspaceArchiveHash !== previous.restoration.workspaceArchiveHash))
    throw new Error("A restored recording must retain the same original backup hashes");
  if (results.benchmark!.state === "running" || results.benchmark!.mergedInto)
    throw new Error("Wait for the active BenchmarkRun and use its aggregate directory");
  const events = (await readFile(resolve(root, "eval-runs", original.id, "evidence/events.jsonl"), "utf8"))
    .trim().split("\n").filter(Boolean).map(line => JSON.parse(line).event);
  const creation = events.find(event => event.type === "session.created" && !event.data.parentID);
  if (!creation?.data.sessionID)
    throw new Error("The original recording does not identify its root session");
  const frozen = resolve(root, "inputs", original.input.evalId, original.input.sourceHash, "workspace");
  if (!(await Bun.file(resolve(frozen, "..", "ready")).exists()))
    throw new Error("The frozen starting workspace is missing");
  const item = results.benchmark!.definition.evals.find(item => item.id === original.input.evalId);
  if (!item || item.sourceHash !== original.input.sourceHash)
    throw new Error("The frozen preparation no longer matches the original inputs");
  const staging = resolve(root, "eval-runs", `.restored-${randomUUID()}`);
  await mkdir(staging, { recursive: false });
  try {
    const preparation = resolve(staging, "preparation");
    const initial = await archive.prepareRestoredInitial(
      results.benchmark!.definition, item, original.input.imageId, frozen, preparation,
    );
    const restored = await archive.restoreArchivedCandidate(
      original.input, creation.data.sessionID, initial, options, staging,
    );
    await rm(preparation, { recursive: true, force: true });
    const elapsedMs = Date.parse(restored.receipt.completedAt) - Date.parse(original.startedAt);
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0)
      throw new Error("Native completion predates the original EvalRun");
    const evidence = { ...restored.evidence };
    // This operation does not claim a live candidate. Validate selection again at publication.
    return results.transaction(() => {
      if (results.benchmark!.state === "running" ||
          results.slot(slot.id)?.evalRunId !== previous.id)
        throw new Error("The BenchmarkRun or selected execution changed during restoration");
      const run = results.startEval(slot, original.input);
      const destination = resolve(root, "eval-runs", run.id);
      renameSync(staging, destination);
      evidence.directory = relative(root, resolve(destination, restored.evidence.directory));
      const completed: EvalRun = {
        ...run,
        state: "completed",
        startedAt: original.startedAt,
        completedAt: restored.receipt.completedAt,
        elapsedMs,
        evidence,
        session: { ...restored.session, database: relative(root, resolve(destination, restored.session.database)) },
        restoration: { ...restored.receipt, evalRunId: original.id },
        metrics: measureRecording(restored.events.map((event, sequence) => ({
          event, sequence, time: new Date("created" in event ? event.created : Date.now()).toISOString(),
        })), restored.tools, evidence),
      };
      for (const event of restored.events)
        results.append({ executionId: run.id, stage: "candidate", time: new Date("created" in event ? event.created : Date.now()).toISOString(), event });
      results.finishEval(completed);
      results.saveBenchmark({ ...results.benchmark!, state: "incomplete", scheduledSlotIds: [], updatedAt: new Date().toISOString() });
      return completed;
    });
  } finally {
    // Only this operation's private staging directory; published evidence is never removed.
    await rm(staging, { recursive: true, force: true });
  }
}
