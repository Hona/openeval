import { expect, test } from "bun:test";
import { OpenCode } from "@opencode/sdk";
import type { SessionMessageInfo } from "@opencode/client";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { EvalRun } from "../../types";
import { EvidenceCapture } from "../evidence";
import { hash } from "../files";
import { OPENCODE_VERSION } from "../opencode/version";
import { openRecording } from "./index";

test("native access reads paginated history before compaction and preserves the original database and files", async () => {
  const directory = await mkdtemp(
    resolve(
      process.platform === "win32" ? "C:/tmp/opencode" : tmpdir(),
      "openeval-recording-",
    ),
  );
  try {
    const database = resolve(directory, "native.db"),
      workspace = resolve(directory, "workspace");
    await Bun.write(resolve(workspace, "answer.txt"), "initial");
    const capture = await EvidenceCapture.create(
      resolve(directory, "evidence"),
      workspace,
    );
    await Bun.write(resolve(workspace, "answer.txt"), "final");
    const manifest = await capture.finish({
      prompt: "Record the supplied answer.",
      response: { text: "READY" },
      tools: [],
      workspace,
    });
    const evidence = {
      directory: resolve(directory, "evidence"),
      hash: manifest.sha256,
    };
    let sessionID: string;
    {
      await using sdk = await OpenCode.create({
        database: { path: database },
        config: {
          directory: resolve(directory, "configuration"),
          project: false,
          content: JSON.stringify({ websearch: false }),
        },
        plugins: [
          {
            id: "no-model-calls",
            async setup(context) {
              await context.session.hook("http.request", () => {
                throw new Error("Tests must not call models");
              });
            },
          },
        ],
      });
      const seed = await sdk.session.create({
        location: { directory },
        model: { providerID: "local", id: "fixture" },
        agent: "build",
      });
      const messages: SessionMessageInfo[] = Array.from(
        { length: 105 },
        (_, index) => ({
          id: `msg_before_${index}`,
          type: "user",
          text: `Before ${index}`,
          time: { created: 1000 + index },
        }),
      );
      messages.push({
        id: "msg_compaction",
        type: "compaction",
        time: { created: 2000 },
        status: "completed",
        reason: "manual",
        summary: "Summary",
        recent: "Recent",
      });
      messages.push({
        id: "msg_after",
        type: "user",
        text: "After compaction",
        time: { created: 3000 },
      });
      const imported = await sdk.session.import({
        info: { ...seed, id: "ses_imported_fixture", outcome: "succeeded" },
        messages,
      });
      sessionID = imported.id;
    }
    const originalHash = hash(await Bun.file(database).bytes());
    const now = new Date().toISOString();
    const run: EvalRun = {
      id: "eval_fixture",
      slotId: "fixture",
      state: "completed",
      startedAt: now,
      completedAt: now,
      elapsedMs: 0,
      evidence,
      input: {
        evalId: "fixture",
        model: "local/fixture",
        repetition: 1,
        prompt: "Record the supplied answer.",
        candidateHash: "fixture",
        sourceHash: "fixture",
        imageId: "fixture",
        timeoutMs: 1000,
        earlyStop: false,
        runtime: {
          imageId: "fixture",
          candidateHash: "fixture",
          judgeHash: "fixture",
        },
      },
      session: {
        sessionId: sessionID,
        database: "native.db",
        databaseHash: originalHash,
        opencodeVersion: "recorded-fixture-version",
      },
    };
    {
      await using context = await openRecording(
        { evidence, run, runDirectory: directory },
        resolve(directory, "scratch"),
      );
      const [db, repeatedDb, sdk, schema] = await Promise.all([
        context.native.database(),
        context.native.database(),
        context.native.sdk(),
        context.native.schema(),
      ]);
      expect(db).toBe(repeatedDb);
      expect(context.native.version).toBe("recorded-fixture-version");
      expect(context.native.readerVersion).toBe(OPENCODE_VERSION);
      expect(schema.Session).toBeDefined();
      expect(() => db.exec("CREATE TABLE forbidden (id INTEGER)")).toThrow();
      expect((await context.recording.messages(sessionID)).length).toBe(107);
      expect((await sdk.session.context({ sessionID })).length).toBe(2);
      expect((await context.recording.export()).messages).toHaveLength(107);
      await sdk.session.rename({ sessionID, title: "Disposable copy" });
      expect(await context.workspace.text("answer.txt", "initial")).toBe(
        "initial",
      );
      expect(await context.workspace.diff("answer.txt")).toEqual({
        initial: "initial",
        final: "final",
      });
      const restored = await context.workspace.materialize();
      await Bun.write(
        resolve(restored, "answer.txt"),
        "verification changed its copy",
      );
      expect(await context.workspace.text("answer.txt")).toBe("final");
    }
    expect(hash(await Bun.file(database).bytes())).toBe(originalHash);
    expect(
      hash(
        await Bun.file(resolve(evidence.directory, "manifest.json")).bytes(),
      ),
    ).toBe(evidence.hash);
    expect(await Bun.file(resolve(workspace, "answer.txt")).text()).toBe(
      "final",
    );
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
}, 30_000);
