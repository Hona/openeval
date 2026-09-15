import { resolve, dirname, sep } from "node:path";
import { watch } from "node:fs";
import { mkdir } from "node:fs/promises";
import { ResultReader } from "./read-results";
import { readRecording } from "../infra/opencode/read-recording";
import type { SessionSnapshot } from "../view";
import type { RunEvent } from "../types";
import type { EvidenceQuery } from "../infra/evidence";

export async function serveResults(options: {
  resultsPath: string;
  port?: number;
  assetsPath?: string;
}) {
  const root = resolve(options.resultsPath);
  await mkdir(root, { recursive: true });
  const reader = new ResultReader(root),
    encoder = new TextEncoder();
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>(),
    streams = new Set<() => void>();
  let changed: ReturnType<typeof setTimeout> | undefined;
  const watcher = watch(root, { recursive: true }, (_event, file) => {
    if (file && !/runner\.db(?:-wal|-shm)?$/.test(String(file))) return;
    if (changed) return;
    changed = setTimeout(() => {
      changed = undefined;
      for (const client of clients)
        try {
          client.enqueue(encoder.encode("event: change\ndata: {}\n\n"));
        } catch {
          clients.delete(client);
        }
    }, 250);
  });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? 4173,
    idleTimeout: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method !== "GET")
        return new Response("Method not allowed", { status: 405 });
      try {
        if (url.pathname === "/api/results")
          return Response.json(await reader.index());
        if (url.pathname === "/api/activity")
          return Response.json(await reader.activity());
        if (url.pathname === "/api/judge-checks")
          return Response.json(
            await reader.judgeAudit(
              url.searchParams.get("benchmark") ?? "",
              url.searchParams.get("judge") ?? "",
            ),
          );
        if (url.pathname === "/api/check-evidence") {
          const query: EvidenceQuery = {
            action: (url.searchParams.get("action") ??
              "summary") as EvidenceQuery["action"],
          };
          for (const key of ["id", "path", "sessionID", "type"] as const) {
            const value = url.searchParams.get(key);
            if (value !== null) query[key] = value;
          }
          for (const key of ["offset", "limit"] as const) {
            const value = url.searchParams.get(key);
            if (value !== null) query[key] = Number(value);
          }
          const revision = url.searchParams.get("revision");
          if (url.searchParams.has("metric"))
            query.metric = url.searchParams.get("metric")!;
          if (revision === "initial" || revision === "final")
            query.revision = revision;
          return Response.json(
            await reader.checkEvidence(
              url.searchParams.get("benchmark") ?? "",
              url.searchParams.get("judge") ?? "",
              url.searchParams.get("check") ?? "",
              query,
            ),
          );
        }
        if (url.pathname === "/api/result")
          return Response.json(
            url.searchParams.get("format") === "runs"
              ? await reader.evalRuns(url.searchParams.get("id") ?? "")
              : await reader.summary(url.searchParams.get("id") ?? ""),
          );
        if (url.pathname === "/api/events") {
          let owner: ReadableStreamDefaultController<Uint8Array>;
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                owner = controller;
                clients.add(controller);
                controller.enqueue(encoder.encode(": connected\n\n"));
              },
              cancel() {
                clients.delete(owner);
              },
            }),
            {
              headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
              },
            },
          );
        }
        if (url.pathname === "/api/session") {
          const benchmarkId = url.searchParams.get("benchmark") ?? "",
            executionId = url.searchParams.get("execution") ?? "";
          const recording = await reader.recording(benchmarkId, executionId);
          const execution = recording.read;
          const initial = execution();
          if (!initial) {
            recording.close();
            return new Response("Unknown execution", { status: 404 });
          }
          const stage = "evalRunId" in initial.input ? "judge" : "candidate";
          let stopped = false,
            pumping = false,
            cursor = 0,
            snapshotSent = false;
          const history: RunEvent[] = [];
          let timer: ReturnType<typeof setInterval>;
          let stop = () => {};
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              const send = (event: string, data: unknown) => {
                if (!stopped)
                  controller.enqueue(
                    encoder.encode(
                      `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
                    ),
                  );
              };
              stop = () => {
                if (stopped) return;
                stopped = true;
                clearInterval(timer);
                streams.delete(stop);
                recording.close();
                request.signal.removeEventListener("abort", stop);
                try {
                  controller.close();
                } catch {}
              };
              streams.add(stop);
              request.signal.addEventListener("abort", stop, { once: true });
              const pump = async () => {
                if (stopped || pumping) return;
                pumping = true;
                try {
                  const current = execution()!;
                  const records: RunEvent[] = [];
                  for (;;) {
                    const page = recording.events(cursor);
                    if (!page.length) break;
                    records.push(...page.map((item) => item.record));
                    cursor = page.at(-1)!.sequence;
                    if (page.length < 1000) break;
                  }
                  history.push(...records);
                  const final = current.state !== "running";
                  if (!snapshotSent || final) {
                    const document = await readRecording(
                      recording.directory,
                      current,
                      history,
                    );
                    send("snapshot", {
                      name: stage,
                      document,
                      executionId,
                    } satisfies SessionSnapshot);
                    snapshotSent = true;
                  } else if (records.length) send("records", records);
                  send("state", {
                    status:
                      current.state === "running"
                        ? "in_progress"
                        : current.state === "completed" ||
                            current.state === "stopped"
                          ? "completed"
                          : "failed",
                    stage,
                  });
                  if (final) {
                    send("done", {});
                    stop();
                  }
                } catch (error) {
                  send("session-error", {
                    message:
                      error instanceof Error ? error.message : String(error),
                  });
                  stop();
                } finally {
                  pumping = false;
                }
              };
              controller.enqueue(encoder.encode("retry: 1000\n\n"));
              timer = setInterval(() => void pump(), 250);
              void pump();
              if (request.signal.aborted) stop();
            },
            cancel() {
              stop();
            },
          });
          return new Response(body, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              "X-Accel-Buffering": "no",
            },
          });
        }
        if (options.assetsPath && !url.pathname.startsWith("/api/")) {
          const assets = resolve(options.assetsPath),
            path = resolve(assets, "." + decodeURIComponent(url.pathname));
          if (path !== assets && !path.startsWith(assets + sep))
            return new Response("Not found", { status: 404 });
          const file = Bun.file(path);
          return new Response(
            url.pathname !== "/" && (await file.exists())
              ? file
              : Bun.file(resolve(assets, "index.html")),
          );
        }
        return new Response("Not found", { status: 404 });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : String(error) },
          { status: 400 },
        );
      }
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    server,
    async close() {
      watcher.close();
      if (changed) clearTimeout(changed);
      for (const stop of streams) stop();
      for (const client of clients)
        try {
          client.close();
        } catch {}
      await server.stop(true);
    },
  };
}
