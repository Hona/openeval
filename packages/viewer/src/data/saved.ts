import {
  queryEvidenceDocument,
  type EvidenceDocument,
  type ResultIndex,
  type SessionStage,
  type ViewerAsset,
  type ViewerExport,
} from "@hona/openeval/view";
import type { ViewerDataSource, ViewerIO } from "./types";

/** The publication format, lazy loading, and integrity checks stay in this adapter. */
export function createSavedSource(
  manifestPath: string,
  options: ViewerIO & { base: string },
): ViewerDataSource {
  const request = options.fetch ?? fetch;
  const manifestURL = new URL(manifestPath, options.base);
  if (manifestURL.origin !== new URL(options.base).origin)
    throw new Error("Viewer exports must use the same origin");
  let manifest: Promise<ViewerExport> | undefined;
  const cached = new Map<string, Promise<unknown>>();
  const index = () =>
    (manifest ??= request(manifestURL.href).then(async (response) => {
      if (!response.ok)
        throw new Error(`Could not load recorded data (${response.status})`);
      const value = (await response.json()) as ViewerExport;
      if (value.version !== 1 || value.source.resultsSchema !== 5)
        throw new Error("Unsupported viewer export");
      return value;
    }));
  const asset = <T>(ref: ViewerAsset | undefined): Promise<T> => {
    if (
      !ref ||
      !/^[a-f0-9]{64}$/.test(ref.sha256) ||
      ref.path !== `objects/${ref.sha256}.json`
    )
      return Promise.reject(
        new Error("Recording is not included in this export"),
      );
    if (!cached.has(ref.path))
      cached.set(
        ref.path,
        (async () => {
          const response = await request(new URL(ref.path, manifestURL).href);
          if (!response.ok)
            throw new Error(
              `Could not load recorded data (${response.status})`,
            );
          const bytes = await response.arrayBuffer();
          const digest = [
            ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          ]
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
          if (digest !== ref.sha256 || bytes.byteLength !== ref.bytes)
            throw new Error("Recorded data failed its integrity check");
          return JSON.parse(new TextDecoder().decode(bytes));
        })().catch((error) => {
          cached.delete(ref.path);
          throw error;
        }),
      );
    return cached.get(ref.path) as Promise<T>;
  };
  const own = <T>(map: Record<string, T>, key: string) =>
    Object.hasOwn(map, key) ? map[key] : undefined;
  const benchmark = async (id: string) => {
    const data = await index();
    if (data.source.benchmarkId !== id)
      throw new Error("Unknown benchmark in this export");
    return data;
  };
  return {
    async index() {
      const data = await asset<ResultIndex>((await index()).index);
      return {
        root: data.root,
        entries: data.entries,
        warnings: data.warnings,
        capabilities: { details: true, activity: false, live: false },
      };
    },
    async summary(id) {
      return asset(own((await index()).results, id)?.summary);
    },
    async runs(id) {
      return asset(own((await index()).results, id)?.runs);
    },
    async activity() {
      return [];
    },
    async judge(id, judge) {
      return asset(own((await benchmark(id)).judges, judge));
    },
    async evidence(id, judge, check, query) {
      const checks = own((await benchmark(id)).evidence, judge);
      return queryEvidenceDocument(
        await asset<EvidenceDocument>(checks && own(checks, check)),
        query,
      );
    },
    watchSession(id, execution, update) {
      let disposed = false;
      void benchmark(id)
        .then((data) => asset<SessionStage>(own(data.sessions, execution)))
        .then((document) => {
          if (disposed) return;
          update({ type: "snapshot", document });
          update({ type: "complete" });
        })
        .catch(() => {
          if (!disposed) update({ type: "connection", state: "unavailable" });
        });
      return () => {
        disposed = true;
      };
    },
    watchChanges() {
      return () => {};
    },
  };
}
