import { pathToFileURL } from "node:url";
import { openRecording, type RecordingInput } from "../recording";
import { jsonOutput } from "./code-result";
import { errorMessage, writeJson } from "../files";
import type { JudgeFunction, RunMetrics } from "../../judge-context";

type Job = RecordingInput & { module: string; output: string; scratch: string };
const job: Job = JSON.parse(await Bun.stdin.text());
let metrics: RunMetrics | undefined;
async function grade() {
  await using context = await openRecording(job, job.scratch);
  metrics = context.metrics;
  const module = await import(pathToFileURL(job.module).href);
  if (typeof module.default !== "function")
    throw new Error("judge.ts must default-export a function");
  const output = jsonOutput(await (module.default as JudgeFunction)(context));
  return { output, metrics: context.metrics };
}
try {
  await writeJson(job.output, await grade());
  process.exit(0);
} catch (error) {
  await writeJson(job.output, { error: errorMessage(error), metrics });
  console.error(error);
  process.exit(1);
}
