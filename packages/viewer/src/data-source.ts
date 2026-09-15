import {
  queryViewerEvidence,
  type SessionStage,
  type ViewerAsset,
  type ViewerEvidence,
  type ViewerExport,
} from "@hona/openeval/view";
import type { EvidenceQuery } from "@hona/openeval";

type Config = { manifest?: string; title?: string; home?: string };

/** The real viewer reads the same DTOs from its local API or a static public export. */
export function createViewerSource(
  config: Config = {},
  options: { base?: string; fetch?: typeof fetch } = {},
) {
  const base =
    options.base ??
    (typeof location === "undefined" ? "http://localhost/" : location.href);
  const request = options.fetch ?? fetch;
  const manifestURL = config.manifest
    ? new URL(config.manifest, base)
    : undefined;
  if (manifestURL && manifestURL.origin !== new URL(base).origin)
    throw new Error("Viewer exports must use the same origin");
  let manifest: Promise<ViewerExport> | undefined;
  const cached = new Map<string, Promise<unknown>>();
  const json = async <T>(url: string): Promise<T> => {
    const response = await request(url);
    if (!response.ok)
      throw new Error(
        (await response.json().catch(() => ({}))).error ??
          `Could not load recorded data (${response.status})`,
      );
    return response.json();
  };
  const index = () =>
    (manifest ??= json<ViewerExport>(manifestURL!.href).then((value) => {
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
  const get = async <T>(path: string): Promise<T> => {
    if (!manifestURL) return json<T>(path);
    const data = await index();
    const url = new URL(path, base),
      params = url.searchParams;
    if (url.pathname === "/api/results") return asset<T>(data.index);
    if (url.pathname === "/api/result") {
      const result = own(data.results, params.get("id") ?? "");
      return asset<T>(
        params.get("format") === "runs" ? result?.runs : result?.summary,
      );
    }
    if (params.get("benchmark") !== data.source.benchmarkId)
      throw new Error("Unknown benchmark in this export");
    const judge = params.get("judge") ?? "";
    if (url.pathname === "/api/judge-checks")
      return asset<T>(own(data.judges, judge));
    if (url.pathname === "/api/check-evidence") {
      const checks = own(data.evidence, judge);
      const evidence = await asset<ViewerEvidence>(
        checks && own(checks, params.get("check") ?? ""),
      );
      const query: EvidenceQuery = {
        action: (params.get("action") ?? "summary") as EvidenceQuery["action"],
      };
      for (const key of ["id", "path", "sessionID", "type", "metric"] as const)
        if (params.has(key)) query[key] = params.get(key)!;
      for (const key of ["offset", "limit"] as const)
        if (params.has(key)) query[key] = Number(params.get(key));
      const revision = params.get("revision");
      if (revision === "initial" || revision === "final")
        query.revision = revision;
      return queryViewerEvidence(evidence, query) as T;
    }
    throw new Error("This operation is not available in a saved recording");
  };
  return {
    saved: !!manifestURL,
    live: !manifestURL,
    config,
    get,
    async session(benchmark: string, execution: string) {
      const data = await index();
      if (benchmark !== data.source.benchmarkId)
        throw new Error("Unknown benchmark in this export");
      return asset<SessionStage>(own(data.sessions, execution));
    },
  };
}

const settings =
  typeof document === "undefined"
    ? null
    : document.getElementById("openeval-source");
export const viewerSource = createViewerSource(
  settings?.textContent ? JSON.parse(settings.textContent) : {},
);
