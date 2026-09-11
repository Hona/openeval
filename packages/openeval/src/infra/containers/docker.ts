import type { Engine } from "../../types";

/** The engine adapter owns argv, process cancellation, and diagnostics. */
export async function engineCommand(
  engine: Engine,
  args: string[],
  options: { output?: string; input?: string; timeoutMs?: number } = {},
) {
  const child = Bun.spawn([engine, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: options.input ? Bun.file(options.input) : "ignore",
  });
  const timer = setTimeout(() => child.kill(), options.timeoutMs ?? 120_000);
  try {
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      options.output
        ? Bun.write(options.output, new Response(child.stdout)).then(() => "")
        : new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (code !== 0)
      throw new Error(
        `${engine} ${args[0]} failed: ${stderr.trim() || stdout.trim() || code}`,
      );
    return stdout.trim();
  } finally {
    clearTimeout(timer);
  }
}
