import type { OpenCodeClient } from "@opencode/client";
import type { OpenCodeStreamEvent } from "../../types";

/** Seal causal history through a committed boundary, independently of live-stream gaps. */
export async function readDurableCheckpoint(
  client: OpenCodeClient,
  rootId: string,
  cutoffAt: number,
  signal: AbortSignal,
  record: (event: OpenCodeStreamEvent) => void,
) {
  const request = () => ({
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  });
  const ids = new Set([rootId]);
  const events: OpenCodeStreamEvent[] = [];
  for (const sessionID of ids) {
    signal.throwIfAborted();
    let previous: number | undefined;
    let created = -Infinity;
    for await (const event of client.session.log(
      { sessionID, follow: false },
      request(),
    )) {
      if (!("durable" in event)) continue;
      if (previous === undefined && event.type !== "session.created")
        throw new Error(
          "Cannot seal a checkpoint without session creation history",
        );
      if (previous !== undefined && event.durable.seq !== previous + 1)
        throw new Error("Cannot seal an incomplete durable session log");
      if (event.created < created)
        throw new Error(
          "Cannot seal a checkpoint across a session clock discontinuity",
        );
      previous = event.durable.seq;
      created = event.created;
      record(event);
      if (event.created <= cutoffAt) events.push(structuredClone(event));
    }
    if (previous === undefined)
      throw new Error("Cannot seal an empty durable session log");
    if (sessionID !== rootId) continue;
    // The isolated database belongs to this execution. Include every session,
    // including child work and sessions launched through the candidate's CLI.
    // Sessions created after the boundary cannot contribute earlier work.
    let cursor: string | undefined;
    do {
      const children = await client.session.list(
        { limit: 100, cursor },
        request(),
      );
      for (const child of children.data)
        if (child.time.created <= cutoffAt) ids.add(child.id);
      cursor = children.cursor.next ?? undefined;
    } while (cursor);
  }
  signal.throwIfAborted();
  return events.sort(
    (a, b) =>
      ("created" in a ? a.created : 0) - ("created" in b ? b.created : 0) ||
      ("durable" in a &&
      "durable" in b &&
      a.durable.aggregateID === b.durable.aggregateID
        ? a.durable.seq - b.durable.seq
        : 0),
  );
}
