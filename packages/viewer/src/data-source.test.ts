import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createViewerSource } from "./data-source";
import type { ViewerAsset, ViewerExport } from "@hona/openeval/view";

test("saved viewer data is lazy, same-origin, integrity checked, and independently addressable", async () => {
  const body = JSON.stringify({ public: true, entries: [{ id: "bench" }] });
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
  expect(source.saved).toBe(true);
  expect(source.live).toBe(false);
  expect(await source.get("/api/results")).toEqual(JSON.parse(body));
  expect(await source.get("/api/results")).toEqual(JSON.parse(body));
  expect(calls).toEqual([
    "https://example.com/demo/data/manifest.json",
    `https://example.com/demo/data/${ref.path}`,
  ]);
  await expect(source.get("/api/result?id=__proto__")).rejects.toThrow();
  await expect(source.session("other", "execution")).rejects.toThrow(
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
  await expect(invalid.get("/api/results")).rejects.toThrow("integrity");
});
