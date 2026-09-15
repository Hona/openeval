import { OpenCode } from "@opencode/sdk/effect";
import { Database } from "@opencode/core/database/database";
import { Effect } from "effect";
import { dirname, resolve } from "node:path";
import { databaseWithCredentials, type Credential } from "./auth";

export { OPENCODE_VERSION } from "./version";
export const createHost = (
  database: string,
  credentials: Credential[],
  websearch: "exa" | false,
) =>
  OpenCode.create(
    {
      events: { persist: true },
      config: {
        directory: resolve(dirname(database), "configuration"),
        project: false,
        content: JSON.stringify({
          websearch: websearch ? { provider: websearch } : false,
        }),
      },
    },
    {
      overrides: [
        Database.node.replace(databaseWithCredentials(database, credentials)),
      ],
    },
  );

export async function createSessionDatabase(
  path: string,
  credentials: Credential[],
) {
  if (await Bun.file(path).exists())
    throw new Error("A session requires a new database");
  await Effect.runPromise(
    Effect.scoped(createHost(path, credentials, false).pipe(Effect.asVoid)),
  );
}
