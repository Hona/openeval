import type { ResultIndex, SessionSnapshot } from "@hona/openeval/view";
import type { RunEvent } from "@hona/openeval/types";
import type {
  ViewerDataSource,
  ViewerIO,
  SessionUpdate,
  SessionProgress,
} from "./types";

/** The local server's HTTP and SSE protocol is contained in this adapter. */
export function createServerSource(
  options: ViewerIO & { base: string },
): ViewerDataSource {
  const request = options.fetch ?? fetch;
  const events = options.events ?? ((url) => new EventSource(url));
  const url = (
    path: string,
    values: Record<string, string | number | undefined> = {},
  ) => {
    const target = new URL(`/api/${path}`, options.base);
    for (const [key, value] of Object.entries(values))
      if (value !== undefined) target.searchParams.set(key, String(value));
    return target.href;
  };
  const get = async <T>(
    path: string,
    values?: Record<string, string | number | undefined>,
  ): Promise<T> => {
    const response = await request(url(path, values));
    if (!response.ok)
      throw new Error(
        (await response.json().catch(() => null))?.error ??
          `Request failed (${response.status})`,
      );
    return response.json();
  };
  return {
    async index() {
      const index = await get<ResultIndex>("results");
      return {
        root: index.root,
        entries: index.entries,
        warnings: index.warnings,
        capabilities: {
          details: !index.public,
          activity: !index.public,
          live: true,
        },
      };
    },
    summary: (id) => get("result", { id, format: "summary" }),
    runs: (id) => get("result", { id, format: "runs" }),
    activity: () => get("activity"),
    judge: (benchmark, judge) => get("judge-checks", { benchmark, judge }),
    evidence: (benchmark, judge, check, query) =>
      get("check-evidence", { benchmark, judge, check, ...query }),
    watchSession(benchmark, execution, update) {
      const stream = events(url("session", { benchmark, execution }));
      stream.onopen = () => update({ type: "connection", state: "streaming" });
      stream.onerror = () =>
        update({ type: "connection", state: "reconnecting" });
      const listen = <T>(name: string, decode: (value: T) => SessionUpdate) =>
        stream.addEventListener(name, (event) =>
          update(decode(JSON.parse((event as MessageEvent).data))),
        );
      listen("snapshot", (snapshot: SessionSnapshot) => ({
        type: "snapshot",
        document: snapshot.document,
      }));
      listen<RunEvent[]>("records", (records) => ({
        type: "records",
        records,
      }));
      listen<SessionProgress>("state", (state) => ({ type: "state", state }));
      stream.addEventListener("done", () => {
        update({ type: "complete" });
        stream.close();
      });
      stream.addEventListener("session-error", () => {
        update({ type: "connection", state: "unavailable" });
        stream.close();
      });
      return () => stream.close();
    },
    watchChanges(changed) {
      const stream = events(url("events"));
      stream.addEventListener("change", changed);
      const timer = setInterval(changed, 5000);
      return () => {
        clearInterval(timer);
        stream.close();
      };
    },
  };
}
