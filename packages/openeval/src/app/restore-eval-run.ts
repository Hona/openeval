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
  if (!previous || !slot || !slot.active || slot.evalRunId !== previous.id ||
      previous.state !== "failed" || !previous.interrupted || previous.evidence)
    throw new Error("Select an active interrupted EvalRun without finalized evidence");
  if (results.benchmark!.state === "running" || results.benchmark!.mergedInto)
    throw new Error("Wait for the active BenchmarkRun and use its aggregate directory");
  const events = (await readFile(resolve(root, "eval-runs", previous.id, "evidence/events.jsonl"), "utf8"))
    .trim().split("\n").filter(Boolean).map(line => JSON.parse(line).event);
  const creation = events.find(event => event.type === "session.created" && !event.data.parentID);
  if (!creation?.data.sessionID)
    throw new Error("The original recording does not identify its root session");
  const initial = resolve(root, "inputs", previous.input.evalId, previous.input.sourceHash, "workspace");
  if (!(await Bun.file(resolve(initial, "..", "ready")).exists()))
    throw new Error("The frozen starting workspace is missing");
  const staging = resolve(root, "eval-runs", `.restored-${randomUUID()}`);
  await mkdir(staging, { recursive: false });
  try {
    const restored = await archive.restoreArchivedCandidate(
      previous.input, creation.data.sessionID, initial, options, staging,
    );
    const evidence = { ...restored.evidence };
    // This operation does not claim a live candidate. Validate selection again at publication.
    return results.transaction(() => {
      if (results.benchmark!.state === "running" ||
          results.slot(slot.id)?.evalRunId !== previous.id)
        throw new Error("The BenchmarkRun or selected execution changed during restoration");
      const run = results.startEval(slot, previous.input);
      const destination = resolve(root, "eval-runs", run.id);
      renameSync(staging, destination);
      evidence.directory = relative(root, resolve(destination, restored.evidence.directory));
      const completed: EvalRun = {
        ...run,
        state: "completed",
        startedAt: previous.startedAt,
        completedAt: restored.receipt.completedAt,
        elapsedMs: Math.max(0, Date.parse(restored.receipt.completedAt) - Date.parse(previous.startedAt)),
        evidence,
        session: { ...restored.session, database: relative(root, resolve(destination, restored.session.database)) },
        restoration: { ...restored.receipt, evalRunId: previous.id },
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
