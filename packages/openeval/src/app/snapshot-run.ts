import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { readBenchmarkRun } from "./read-run";
import { fingerprint } from "../infra/files";
import { benchmarkScores } from "./scores";

/** Named selection snapshots, never copies of candidate execution.
 * Reproducible audit inputs: https://arxiv.org/html/2607.07946#S7
 */
export async function snapshotBenchmarkRun(directory: string, name: string) {
  if (!/^[a-zA-Z0-9][\w-]{0,63}$/.test(name))
    throw new Error("Use a short alphanumeric snapshot name");
  const root = resolve(directory),
    records = readBenchmarkRun(root);
  const slots = records.slots.filter((slot) => slot.active);
  const payload = {
    version: 1,
    name,
    capturedAt: new Date().toISOString(),
    benchmark: records.benchmark,
    slots,
    evaluations: records.evals.filter((run) =>
      slots.some((slot) => slot.evalRunId === run.id),
    ),
    judgments: records.judges.filter((run) =>
      slots.some((slot) => slot.judgeRunId === run.id),
    ),
    scores: benchmarkScores(
      records.benchmark.definition,
      slots,
      records.judges,
    ),
  };
  const path = resolve(root, "maintenance/snapshots", `${name}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify({ hash: fingerprint(payload), payload }, null, 2),
    { flag: "wx" },
  );
  return { path, hash: fingerprint(payload), slots: slots.length };
}
