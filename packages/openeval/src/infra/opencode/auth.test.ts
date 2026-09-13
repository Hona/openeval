import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createCredentialSnapshot, credentialsFor } from "./auth";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test("copies only requested active credentials without refresh tokens or expiry changes", async () => {
  const directory = await mkdtemp(
    resolve(tmpdir(), "eval-runner-credential-test-"),
  );
  directories.push(directory);
  const source = resolve(directory, "source.db");
  const database = new Database(source, { create: true });
  database.exec(`
    CREATE TABLE credential (
      id TEXT PRIMARY KEY,
      integration_id TEXT NOT NULL,
      label TEXT,
      value TEXT NOT NULL,
      connector_id TEXT,
      method_id TEXT,
      active INTEGER NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    )
  `);
  database
    .query("INSERT INTO credential VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(
      "oauth",
      "provider",
      "OAuth",
      JSON.stringify({
        type: "oauth",
        access: "access-token",
        refresh: "must-not-leave-host",
        expires: 1,
      }),
      null,
      null,
      1,
      1,
      1,
    );
  database
    .query("INSERT INTO credential VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(
      "unrelated",
      "other",
      "Other",
      JSON.stringify({ type: "key", key: "other-secret" }),
      null,
      null,
      1,
      1,
      1,
    );
  database
    .query("INSERT INTO credential VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(
      "inactive",
      "provider",
      "Inactive",
      JSON.stringify({ type: "key", key: "inactive-secret" }),
      null,
      null,
      0,
      1,
      1,
    );
  database.close(true);

  const snapshot = await createCredentialSnapshot(source, ["provider"]);
  const value = JSON.parse(snapshot[0].value);

  expect(snapshot).toHaveLength(1);
  expect(value.access).toBe("access-token");
  expect(value.refresh).toBe("");
  expect(value.expires).toBe(1);
  const previous = process.env.OPENCODE_DB;
  process.env.OPENCODE_DB = source;
  try {
    expect(
      credentialsFor(
        ["provider/root", "other/worker", "provider/reviewer"],
        false,
      )
        .map((row) => row.id)
        .sort(),
    ).toEqual(["oauth", "unrelated"]);
    expect(credentialsFor("provider/root", false).map((row) => row.id)).toEqual(
      ["oauth"],
    );
    expect(() =>
      credentialsFor(["provider/root", "missing/worker"], false),
    ).toThrow("No active OpenCode connection for missing");
  } finally {
    if (previous === undefined) delete process.env.OPENCODE_DB;
    else process.env.OPENCODE_DB = previous;
  }
  const original = new Database(source, { readonly: true });
  try {
    const row = original
      .query("SELECT value FROM credential WHERE id='oauth'")
      .get() as { value: string };
    expect(JSON.parse(row.value).refresh).toBe("must-not-leave-host");
  } finally {
    original.close(true);
  }
});
