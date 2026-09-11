import { Database } from "@opencode/core/database/database";
import { Global } from "@opencode/util/global";
import { makeGlobalNode } from "@opencode/util/effect/app-node";
import { Context, Effect, Layer } from "effect";
import { Database as SQLite } from "bun:sqlite";
import { isAbsolute, join } from "node:path";
import type { ModelRef } from "../../types";

export type Credential = {
  id: string;
  integration_id: string | null;
  label: string;
  value: string;
  connector_id: string | null;
  method_id: string | null;
  active: number | null;
  time_created: number;
  time_updated: number;
};
export const localCredentialPath = () => {
  const path = process.env.OPENCODE_DB ?? "opencode.db";
  return isAbsolute(path) ? path : join(Global.Path.data, path);
};
export function createCredentialSnapshot(
  source = localCredentialPath(),
  integrations?: readonly string[],
): Credential[] {
  const db = new SQLite(source, { readonly: true });
  try {
    const rows = db
      .query(
        "SELECT id,integration_id,label,value,connector_id,method_id,active,time_created,time_updated FROM credential",
      )
      .all() as Credential[];
    return rows
      .filter(
        (row) =>
          row.active !== 0 &&
          (!integrations || integrations.includes(row.integration_id ?? "")),
      )
      .map((row) => {
        const parsed = JSON.parse(row.value) as {
          type: string;
          refresh?: string;
        };
        return {
          ...row,
          value:
            parsed.type === "oauth"
              ? JSON.stringify({ ...parsed, refresh: "" })
              : row.value,
        };
      });
  } finally {
    db.close(true);
  }
}
export const credentialsFor = (model: ModelRef, websearch: "exa" | false) => {
  const provider = model.split("/")[0];
  const integration = provider.startsWith("console-") ? "opencode" : provider;
  const required = [
    ...new Set([integration, ...(websearch ? ["opencode", "exa"] : [])]),
  ];
  const credentials = createCredentialSnapshot(undefined, required);
  if (!credentials.some((row) => row.integration_id === integration))
    throw new Error(`No active OpenCode connection for ${integration}`);
  return credentials;
};
export const databaseWithCredentials = (
  path: string,
  credentials: Credential[],
) =>
  makeGlobalNode({
    service: Database.Service,
    layer: Database.layer({ path }).pipe(
      Layer.tap((context) => {
        const database = Context.get(context, Database.Service);
        return Effect.gen(function* () {
          for (const row of credentials) {
            const values = [
              row.id,
              row.integration_id,
              row.label,
              row.value,
              row.connector_id,
              row.method_id,
              row.active,
              row.time_created,
              row.time_updated,
            ].map((value) =>
              value === null
                ? "NULL"
                : typeof value === "number"
                  ? String(value)
                  : `'${value.replaceAll("'", "''")}'`,
            );
            yield* database.db
              .run(
                `INSERT INTO credential (id,integration_id,label,value,connector_id,method_id,active,time_created,time_updated) VALUES (${values.join(",")})`,
              )
              .pipe(Effect.orDie);
          }
        });
      }),
    ),
    deps: [Global.node],
  });

/** Purge secrets before the database becomes a finalized evidence artifact. */
export function removeCredentials(path: string) {
  const db = new SQLite(path);
  try {
    db.exec(
      "PRAGMA busy_timeout=5000; PRAGMA wal_checkpoint(TRUNCATE); PRAGMA secure_delete=ON; DELETE FROM credential; VACUUM; PRAGMA wal_checkpoint(TRUNCATE);",
    );
  } finally {
    db.close(true);
  }
}
