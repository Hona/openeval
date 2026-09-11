import { cp, mkdir, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { Results } from "../infra/sqlite";
import { CandidateEvidence } from "../infra/evidence";
import { hash } from "../infra/files";
import { loadBenchmark } from "./load-benchmark";
import { finishBenchmark } from "./run-benchmark";

/** Consolidate same-benchmark evidence without repeating execution or rewriting finalized records. */
export async function mergeBenchmarkRuns(
  targetPath: string,
  sourcePath: string,
) {
  const directory = resolve(targetPath),
    sourceDirectory = resolve(sourcePath);
  if (directory === sourceDirectory)
    throw new Error("Select two different run directories");
  let sourceId: string, sourceHash: string;
  const backup = resolve(directory, "maintenance", `merge-${Date.now()}`);
  {
    using target = new Results(resolve(directory, "runner.db"), true);
    using source = new Results(resolve(sourceDirectory, "runner.db"), true);
    if (!target.benchmark || !source.benchmark)
      throw new Error("Both directories must contain benchmark runs");
    if (source.benchmark.mergedInto === target.benchmark.id)
      return { directory, benchmark: target.benchmark };
    if (source.benchmark.mergedInto || target.benchmark.mergedInto)
      throw new Error("Select the current aggregate run");
    if ([target.benchmark.state, source.benchmark.state].includes("running"))
      throw new Error("Wait for active work before merging");
    const key = (path: string) =>
      process.platform === "win32"
        ? resolve(path).toLowerCase()
        : resolve(path);
    if (key(target.benchmark.source) !== key(source.benchmark.source))
      throw new Error("Runs belong to different benchmarks");
    sourceId = source.benchmark.id;
    await target.backup(resolve(backup, "target.db"));
    await source.backup(resolve(backup, "source.db"));
    sourceHash = hash(await Bun.file(resolve(backup, "source.db")).bytes());
  }
  for (const folder of ["eval-runs", "judge-runs", "inputs"]) {
    const path = resolve(sourceDirectory, folder);
    if (!(await readdir(path).catch(() => undefined))) continue;
    await mkdir(resolve(directory, folder), { recursive: true });
    await cp(path, resolve(directory, folder), {
      recursive: true,
      force: false,
      errorOnExist: false,
      verbatimSymlinks: true,
    });
  }
  using target = new Results(resolve(directory, "runner.db"));
  using source = new Results(resolve(sourceDirectory, "runner.db"));
  for (const run of [...source.evalRuns(), ...source.judgeRuns()]) {
    if (
      run.session &&
      hash(await Bun.file(resolve(directory, run.session.database)).bytes()) !==
        run.session.databaseHash
    )
      throw new Error(`Copied session archive does not match ${run.id}`);
    if ("slotId" in run && run.evidence)
      await CandidateEvidence.open(
        resolve(directory, run.evidence.directory),
        run.evidence.hash,
      );
  }
  for (const judge of source.judgeRuns())
    for (const check of source.judgeChecks(judge.id))
      await CandidateEvidence.open(
        resolve(directory, check.checkpoint.directory),
        check.checkpoint.hash,
      );
  const previous = target.benchmark!;
  const current = await loadBenchmark(previous.source);
  const definition = {
    ...current,
    models: [
      ...new Set([
        ...previous.definition.models,
        ...source.benchmark!.definition.models,
        ...current.models,
      ]),
    ],
  };
  target.mergeFinalized(source);
  target.saveBenchmark(
    {
      ...previous,
      definition,
      state: "incomplete",
      updatedAt: new Date().toISOString(),
      sources: [
        ...(previous.sources ?? []),
        {
          id: sourceId,
          directory: relative(directory, sourceDirectory),
          mergedAt: new Date().toISOString(),
          databaseHash: sourceHash,
        },
      ],
    },
    true,
  );
  const benchmark = finishBenchmark({
    directory,
    definition,
    runtime: previous.runtime,
    results: target,
  });
  source.saveBenchmark({
    ...source.benchmark!,
    mergedInto: previous.id,
    updatedAt: new Date().toISOString(),
  });
  return { directory, benchmark };
}
