#!/usr/bin/env bun
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  runBenchmark,
  loadBenchmark,
  buildImage,
  addModels,
  removeModels,
  retryEvalRun,
  judgeRun,
  serveResults,
  mergeBenchmarkRuns,
  snapshotBenchmarkRun,
  exportViewer,
} from "./index";
import type { ModelRef } from "./index";

const args = process.argv.slice(2),
  command = args[0] ?? "run";
const option = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const models = (flag = "--model") =>
  args.flatMap((arg, index) =>
    arg === flag ? [args[index + 1] as ModelRef] : [],
  );
const benchmark = resolve(option("--benchmark") ?? process.cwd());
try {
  if (command === "--help" || command === "help" || args.includes("--help")) {
    console.log(`Usage: openeval <command> [options]

Commands:
  image                 Build the candidate container image
  plan                  Show missing or changed work without executing it
  run                   Execute missing or changed work in the current result
  view                  Serve the results viewer
  export <run>          Export a sanitized, static viewer with recordings
  snapshot <run> <name>  Export a score snapshot
  merge-runs <to> <from> Merge results into one aggregate
  add-models <run>       Add models with repeated --model flags
  remove-models <run>    Remove active models while retaining their evidence
  retry <run> <eval-run> Retry a candidate execution
  rejudge <run> <eval-run> Judge the saved evidence again

Options:
  --benchmark <dir>      Benchmark directory (default: current directory)
  --run <dir>            Resume a specific result directory
  --new                 Start a new result
  --model <provider/id>  Model to add or remove (repeatable)
  --only-model <ref>     Execute only this model (repeatable)
  --only-eval <id>       Execute only this eval (repeatable)
  --only-repetition <n>  Execute only this repetition (repeatable)
  --max-cost <usd>       Scheduling budget for this invocation
  --final-only          Judge only after candidates finish
  --port <port>         Viewer port (default: 4173)
  --output <dir>        New public viewer directory (export)
  --allow-artifact <path> Allow a reviewed UTF-8 workspace artifact (repeatable)

Requires Bun 1.4.2+, Docker, and an authenticated OpenCode installation.`);
  } else if (command === "--version") {
    console.log(
      (await Bun.file(new URL("../package.json", import.meta.url)).json())
        .version,
    );
  } else if (command === "export") {
    if (!args[1] || !option("--output"))
      throw new Error(
        "export requires a run directory and --output <new-directory>",
      );
    const manifest = await exportViewer({
      directory: resolve(args[1]),
      output: resolve(option("--output")!),
      assetsPath: fileURLToPath(new URL("../viewer/", import.meta.url)),
      artifacts: args.flatMap((arg, index) =>
        arg === "--allow-artifact" ? [args[index + 1]] : [],
      ),
    });
    console.log(
      JSON.stringify(
        {
          output: resolve(option("--output")!),
          benchmark: manifest.source.benchmarkId,
          redactions: manifest.redactions,
        },
        null,
        2,
      ),
    );
  } else if (command === "image") {
    await buildImage((await loadBenchmark(benchmark)).container);
    console.log("Candidate image ready");
  } else if (command === "view") {
    const viewer = await serveResults({
      resultsPath: resolve(benchmark, "results"),
      port: Number(option("--port") ?? 4173),
      assetsPath: fileURLToPath(new URL("../viewer/", import.meta.url)),
    });
    console.log(viewer.url);
  } else if (command === "run" || command === "plan") {
    const result = await runBenchmark(benchmark, {
      fresh: args.includes("--new"),
      directory: option("--run"),
      models: models().length ? models() : undefined,
      onlyModels: models("--only-model").length
        ? models("--only-model")
        : undefined,
      onlyEvals: args.flatMap((arg, index) =>
        arg === "--only-eval" ? [args[index + 1]] : [],
      ).length
        ? args.flatMap((arg, index) =>
            arg === "--only-eval" ? [args[index + 1]] : [],
          )
        : undefined,
      maxCostUSD: args.includes("--max-cost")
        ? Number(option("--max-cost"))
        : undefined,
      finalOnly: args.includes("--final-only"),
      onlyRepetitions: args.includes("--only-repetition")
        ? args.flatMap((arg, index) =>
            arg === "--only-repetition" ? [Number(args[index + 1])] : [],
          )
        : undefined,
      dryRun: command === "plan",
    });
    console.log(
      JSON.stringify(
        {
          directory: result.directory,
          estimate: result.estimate,
          work: result.plan.map((item) => ({
            eval: item.slot.evalId,
            model: item.slot.model,
            repetition: item.slot.repetition,
            action: item.action,
            reason: item.reason,
          })),
          status: result.benchmark?.state,
        },
        null,
        2,
      ),
    );
  } else if (command === "snapshot") {
    if (!args[1] || !args[2])
      throw new Error("snapshot requires a run directory and snapshot name");
    console.log(await snapshotBenchmarkRun(resolve(args[1]), args[2]));
  } else if (command === "merge-runs") {
    if (!args[1] || !args[2])
      throw new Error(
        "merge-runs requires the aggregate and source run directories",
      );
    console.log(await mergeBenchmarkRuns(resolve(args[1]), resolve(args[2])));
  } else if (command === "add-models") {
    if (!args[1])
      throw new Error("add-models requires a benchmark run directory");
    console.log((await addModels(resolve(args[1]), models())).directory);
  } else if (command === "remove-models") {
    if (!args[1])
      throw new Error("remove-models requires a benchmark run directory");
    const result = await removeModels(resolve(args[1]), models());
    console.log(
      JSON.stringify(
        {
          directory: result.directory,
          removed: result.removed,
          retiredSlots: result.retiredSlots,
          status: result.benchmark.state,
        },
        null,
        2,
      ),
    );
  } else if (command === "retry" || command === "rejudge") {
    if (!args[1] || !args[2])
      throw new Error(
        `${command} requires a benchmark run directory and eval run ID`,
      );
    const result =
      command === "retry"
        ? await retryEvalRun(resolve(args[1]), args[2])
        : await judgeRun(resolve(args[1]), args[2]);
    console.log(JSON.stringify(result, null, 2));
  } else
    throw new Error(
      "Commands: image, plan, run, view, add-models, remove-models, merge-runs, retry, rejudge, snapshot",
    );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
