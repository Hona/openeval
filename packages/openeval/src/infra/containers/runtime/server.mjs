import { ServerProcess } from "@opencode/server/process";
import { Effect, Fiber } from "effect";

process.title = "opencode";
const runtime = Effect.runFork(
  Effect.scoped(
    Effect.gen(function* () {
      yield* ServerProcess.start({
        hostname: "0.0.0.0",
        port: 4096,
        password: process.env.OPENCODE_SERVER_PASSWORD,
        app: { name: "opencode", version: "0.0.0-beta-19296" },
        database: { path: "/home/dev/.local/share/opencode/opencode.db" },
        events: { persist: true },
      });
      yield* Effect.never;
    }),
  ),
);
let closing = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    void Effect.runPromise(Fiber.interrupt(runtime)).finally(() =>
      process.exit(0),
    );
  });
void Effect.runPromise(Fiber.join(runtime)).catch((error) => {
  console.error(error);
  process.exit(1);
});
