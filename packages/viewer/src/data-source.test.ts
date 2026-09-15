import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createViewerSource } from "./data-source";
import type { ViewerAsset, ViewerExport } from "@hona/openeval/view";
import type { SessionUpdate } from "./data/types";

test("saved viewer data is lazy, same-origin, integrity checked, and independently addressable", async () => {
  const body = JSON.stringify({
    public: true,
    root: "recording",
    entries: [{ id: "bench" }],
    warnings: [],
  });
  const sha256 = createHash("sha256").update(body).digest("hex");
  const ref: ViewerAsset = {
    path: `objects/${sha256}.json`,
    sha256,
    bytes: Buffer.byteLength(body),
  };
  const manifest = {
    version: 1,
    source: { benchmarkId: "bench", resultsSchema: 5 },
    index: ref,
    results: {},
    sessions: {},
    judges: {},
    evidence: {},
  } as ViewerExport;
  const calls: string[] = [];
  let corrupted = false;
  const source = createViewerSource(
    { manifest: "./data/manifest.json" },
    {
      base: "https://example.com/demo/",
      fetch: (async (input) => {
        const url = String(input);
        calls.push(url);
        return new Response(
          url.endsWith("manifest.json")
            ? JSON.stringify(manifest)
            : corrupted
              ? "corrupt"
              : body,
        );
      }) as typeof fetch,
    },
  );
  expect(calls).toEqual([]);
  const loaded = await source.index();
  expect(loaded.capabilities).toEqual({
    details: true,
    activity: false,
    live: false,
  });
  expect(loaded.entries.map((entry) => entry.id)).toEqual(["bench"]);
  expect(await source.index()).toEqual(loaded);
  expect(calls).toEqual([
    "https://example.com/demo/data/manifest.json",
    `https://example.com/demo/data/${ref.path}`,
  ]);
  await expect(source.summary("__proto__")).rejects.toThrow();
  await expect(source.judge("other", "execution")).rejects.toThrow(
    "Unknown benchmark",
  );
  expect(() =>
    createViewerSource(
      { manifest: "https://elsewhere.example/data" },
      { base: "https://example.com/" },
    ),
  ).toThrow("same origin");
  corrupted = true;
  const invalid = createViewerSource(
    { manifest: "data/manifest.json" },
    {
      base: "https://example.com/demo/",
      fetch: (async (input) =>
        new Response(
          String(input).endsWith("manifest.json")
            ? JSON.stringify(manifest)
            : "corrupt",
        )) as typeof fetch,
    },
  );
  await expect(invalid.index()).rejects.toThrow("integrity");
});

class TestStream extends EventTarget {
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  close() {
    this.closed = true;
  }
  send(type: string, data = {}) {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
}

test("server adapter owns URLs, live events, and capability translation", async () => {
  const calls: URL[] = [],
    streams: TestStream[] = [];
  const source = createViewerSource(
    {},
    {
      base: "https://local.example/",
      fetch: (async (input) => {
        const url = new URL(String(input));
        calls.push(url);
        return Response.json(
          url.pathname === "/api/results"
            ? { public: false, root: "/results", entries: [], warnings: [] }
            : {},
        );
      }) as typeof fetch,
      events: (url) => {
        calls.push(new URL(url));
        const stream = new TestStream();
        streams.push(stream);
        return stream as unknown as EventSource;
      },
    },
  );
  expect((await source.index()).capabilities).toEqual({
    details: true,
    activity: true,
    live: true,
  });
  await source.evidence("bench", "judge", "check", {
    action: "message",
    id: "session:message#1",
    offset: 42,
  });
  expect(calls.at(-1)!.pathname).toBe("/api/check-evidence");
  expect(calls.at(-1)!.searchParams.get("id")).toBe("session:message#1");
  expect(calls.at(-1)!.searchParams.get("offset")).toBe("42");
  const updates: SessionUpdate[] = [];
  const stop = source.watchSession("bench", "eval", (event) =>
    updates.push(event),
  );
  const document = { prompt: "Task", model: "local/test", sessions: [] };
  streams[0].send("snapshot", {
    name: "candidate",
    executionId: "eval",
    document,
  });
  streams[0].send("state", { stage: "candidate", status: "completed" });
  streams[0].send("done");
  expect(updates).toEqual([
    { type: "snapshot", document },
    { type: "state", state: { stage: "candidate", status: "completed" } },
    { type: "complete" },
  ]);
  expect(streams[0].closed).toBe(true);
  stop();
  let changes = 0;
  const stopChanges = source.watchChanges(() => changes++);
  streams[1].send("change");
  stopChanges();
  expect(changes).toBe(1);
  expect(streams[1].closed).toBe(true);
});

test("saved recordings emit the same typed session updates without an event stream", async () => {
  const document = { prompt: "Task", model: "local/test", sessions: [] };
  const text = JSON.stringify(document),
    sha256 = createHash("sha256").update(text).digest("hex");
  const source = createViewerSource(
    { manifest: "manifest.json" },
    {
      base: "https://example.com/demo/",
      fetch: (async (input) =>
        new Response(
          String(input).endsWith("manifest.json")
            ? JSON.stringify({
                version: 1,
                source: { benchmarkId: "bench", resultsSchema: 5 },
                sessions: {
                  eval: {
                    path: `objects/${sha256}.json`,
                    sha256,
                    bytes: Buffer.byteLength(text),
                  },
                },
              })
            : text,
        )) as typeof fetch,
      events: () => {
        throw new Error("Saved data must not create an event stream");
      },
    },
  );
  const events = await new Promise<SessionUpdate[]>((resolve) => {
    const updates: SessionUpdate[] = [];
    source.watchSession("bench", "eval", (event) => {
      updates.push(event);
      if (event.type === "complete") resolve(updates);
    });
  });
  expect(events).toEqual([
    { type: "snapshot", document },
    { type: "complete" },
  ]);
  source.watchChanges(() => {
    throw new Error("Saved data must not poll");
  })();
});
