import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CodeJudgeDefinition,
  CodeJudgeExecution,
  JsonValue,
  RunMetrics,
} from "../../judge-context";
import type { RecordingInput } from "../recording";
import { codeJudgment, jsonOutput } from "./code-result";
import { errorMessage, writeJson } from "../files";

/** A separate process bounds synchronous loops as well as asynchronous judges. */
export async function executeCodeJudge(
  code: CodeJudgeDefinition,
  recording: RecordingInput,
  directory: string,
  timeoutMs: number,
): Promise<CodeJudgeExecution> {
  directory = resolve(directory);
  await mkdir(directory, { recursive: true });
  const module = resolve(directory, "judge.js"),
    output = resolve(directory, "output.json");
  const scratch = resolve(directory, "scratch");
  const stdout = resolve(directory, "stdout.log"),
    stderr = resolve(directory, "stderr.log");
  await Bun.write(module, code.source);
  await Bun.write(resolve(directory, "judge.js.map"), code.sourceMap);
  await writeJson(resolve(directory, "dependencies.json"), code.dependencies);
  const startedAt = new Date().toISOString();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let raw: JsonValue | undefined, metrics: RunMetrics | undefined;
  const base = { startedAt, sourceHash: code.hash, stdout, stderr };
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        fileURLToPath(new URL("./code-worker.ts", import.meta.url)),
      ],
      {
        cwd: directory,
        stdin: "pipe",
        stdout: Bun.file(stdout),
        stderr: Bun.file(stderr),
        windowsHide: true,
      },
    );
    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    await child.stdin.write(
      JSON.stringify({ ...recording, module, output, scratch }),
    );
    child.stdin.end();
    const exit = await child.exited;
    if (timedOut)
      throw new Error(`judge.ts exceeded its ${timeoutMs}ms time limit`);
    const result = await Bun.file(output).json();
    metrics = result.metrics;
    if (exit !== 0 || result.error)
      throw new Error(result.error ?? `judge.ts exited with code ${exit}`);
    raw = jsonOutput(result.output);
    const judgment = codeJudgment(raw);
    return {
      ...base,
      state: "completed",
      completedAt: new Date().toISOString(),
      elapsedMs: Date.now() - Date.parse(startedAt),
      output: raw,
      metrics,
      scores: Object.fromEntries(
        Object.entries(judgment.scores).map(([id, score]) => [id, score.value]),
      ),
    };
  } catch (error) {
    return {
      ...base,
      state: timedOut ? "timed_out" : "failed",
      completedAt: new Date().toISOString(),
      elapsedMs: Date.now() - Date.parse(startedAt),
      error: errorMessage(error),
      output: raw,
      metrics,
    };
  } finally {
    clearTimeout(timer);
    await rm(scratch, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
}
