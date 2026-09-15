import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { and, eq, gt, asc } from "drizzle-orm";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import * as tables from "./schema";
import { isScored, JUDGE_PROTOCOL, criterionMean } from "../../judgment";
import type {
  BenchmarkRun,
  EvalRun,
  EvalRunInput,
  JudgeRun,
  JudgeRunInput,
  Slot,
  RunEvent,
  EvidenceCheckpoint,
  JudgeCheck,
} from "../../types";

const APPLICATION_ID = 0x4f455632;
const SCHEMA_VERSION = 5;
const timestamp = () => new Date().toISOString();

/** One owner for run selection and append-only finalized execution records. */
export class Results {
  readonly path: string;
  private sqlite: Database;
  private db;
  private closed = false;

  constructor(path: string, readonly = false) {
    this.path = path === ":memory:" ? path : resolve(path);
    const existed = this.path !== ":memory:" && existsSync(this.path);
    if (!readonly && this.path !== ":memory:")
      mkdirSync(dirname(this.path), { recursive: true });
    this.sqlite = new Database(
      this.path,
      readonly ? { readonly: true } : { create: true },
    );
    try {
      this.sqlite.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
      if (!existed && !readonly)
        this.sqlite.exec(`
        PRAGMA journal_mode=WAL; PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=${SCHEMA_VERSION};
        CREATE TABLE benchmark_runs (id TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE revisions (id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT NOT NULL);
        CREATE TABLE slots (id TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE eval_runs (id TEXT PRIMARY KEY, state TEXT NOT NULL, value TEXT NOT NULL);
        CREATE TABLE judge_runs (id TEXT PRIMARY KEY, state TEXT NOT NULL, value TEXT NOT NULL);
        CREATE TABLE events (execution_id TEXT NOT NULL, sequence INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY (execution_id,sequence));
        CREATE TABLE evidence_checkpoints (id TEXT PRIMARY KEY, eval_run_id TEXT NOT NULL REFERENCES eval_runs(id), value TEXT NOT NULL);
        CREATE TABLE judge_checks (id TEXT PRIMARY KEY, judge_run_id TEXT NOT NULL REFERENCES judge_runs(id), state TEXT NOT NULL, value TEXT NOT NULL);
        CREATE INDEX judge_checks_run ON judge_checks(judge_run_id);
        CREATE TRIGGER checkpoints_immutable_update BEFORE UPDATE ON evidence_checkpoints BEGIN SELECT RAISE(ABORT,'Evidence checkpoints are immutable'); END;
        CREATE TRIGGER checkpoints_immutable_delete BEFORE DELETE ON evidence_checkpoints BEGIN SELECT RAISE(ABORT,'Evidence checkpoints are immutable'); END;
        CREATE TRIGGER checks_immutable_update BEFORE UPDATE ON judge_checks WHEN old.state != 'running' BEGIN SELECT RAISE(ABORT,'Finalized judge checks are immutable'); END;
        CREATE TRIGGER checks_immutable_delete BEFORE DELETE ON judge_checks BEGIN SELECT RAISE(ABORT,'Judge check history is immutable'); END;
        CREATE TRIGGER eval_runs_immutable_update BEFORE UPDATE ON eval_runs WHEN old.state != 'running' BEGIN SELECT RAISE(ABORT,'Finalized eval runs are immutable'); END;
        CREATE TRIGGER eval_runs_immutable_delete BEFORE DELETE ON eval_runs BEGIN SELECT RAISE(ABORT,'Eval run history is immutable'); END;
        CREATE TRIGGER judge_runs_immutable_update BEFORE UPDATE ON judge_runs WHEN old.state != 'running' BEGIN SELECT RAISE(ABORT,'Finalized judge runs are immutable'); END;
        CREATE TRIGGER judge_runs_immutable_delete BEFORE DELETE ON judge_runs BEGIN SELECT RAISE(ABORT,'Judge run history is immutable'); END;
        CREATE TRIGGER revisions_immutable_update BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT,'Definition history is immutable'); END;
        CREATE TRIGGER revisions_immutable_delete BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT,'Definition history is immutable'); END;
      `);
      const app = this.sqlite.query("PRAGMA application_id").get() as {
        application_id: number;
      };
      const version = this.sqlite.query("PRAGMA user_version").get() as {
        user_version: number;
      };
      if (
        app.application_id !== APPLICATION_ID ||
        version.user_version !== SCHEMA_VERSION
      )
        throw new Error(
          `OpenEval requires results schema ${SCHEMA_VERSION}; start a new benchmark run`,
        );
      this.sqlite.exec(
        readonly ? "PRAGMA query_only=ON" : "PRAGMA synchronous=NORMAL",
      );
      this.db = drizzle(this.sqlite);
    } catch (error) {
      this.sqlite.close(true);
      throw error;
    }
  }
  get benchmark() {
    return this.db.select().from(tables.benchmarkRuns).get()?.value;
  }
  saveBenchmark(value: BenchmarkRun, revision = false) {
    this.transaction(() => {
      if (revision) this.db.insert(tables.revisions).values({ value }).run();
      this.db
        .insert(tables.benchmarkRuns)
        .values({ id: value.id, value })
        .onConflictDoUpdate({ target: tables.benchmarkRuns.id, set: { value } })
        .run();
    });
  }
  revisions() {
    return this.db
      .select()
      .from(tables.revisions)
      .all()
      .map((row) => row.value);
  }
  async backup(path: string) {
    if (existsSync(path)) throw new Error("Backup already exists");
    mkdirSync(dirname(path), { recursive: true });
    await Bun.write(path, this.sqlite.serialize());
  }
  slots() {
    return this.db
      .select()
      .from(tables.slots)
      .all()
      .map((row) => row.value);
  }
  slot(id: string) {
    return this.db
      .select()
      .from(tables.slots)
      .where(eq(tables.slots.id, id))
      .get()?.value;
  }
  select(slot: Slot) {
    if (slot.evalRunId) {
      const run = this.evalRun(slot.evalRunId);
      if (
        !run ||
        run.slotId !== slot.id ||
        run.input.candidateHash !== slot.candidateHash
      )
        throw new Error("Selected eval run does not match this slot's inputs");
    }
    if (slot.judgeRunId) {
      const run = this.judgeRun(slot.judgeRunId);
      if (
        !run ||
        run.state !== "completed" ||
        run.input.evalRunId !== slot.evalRunId ||
        run.input.judgeHash !== slot.judgeHash
      )
        throw new Error(
          "Selected judgment does not match this slot's evidence and rubric",
        );
    }
    this.db
      .insert(tables.slots)
      .values({ id: slot.id, value: slot })
      .onConflictDoUpdate({ target: tables.slots.id, set: { value: slot } })
      .run();
  }
  evalRuns() {
    return this.db
      .select()
      .from(tables.evalRuns)
      .all()
      .map((row) => row.value);
  }
  judgeRuns() {
    return this.db
      .select()
      .from(tables.judgeRuns)
      .all()
      .map((row) => row.value);
  }
  evalRun(id: string) {
    return this.db
      .select()
      .from(tables.evalRuns)
      .where(eq(tables.evalRuns.id, id))
      .get()?.value;
  }
  judgeRun(id: string) {
    return this.db
      .select()
      .from(tables.judgeRuns)
      .where(eq(tables.judgeRuns.id, id))
      .get()?.value;
  }
  startEval(slot: Slot, input: EvalRunInput) {
    const value: EvalRun = {
      id: `eval_${randomUUID()}`,
      slotId: slot.id,
      input,
      state: "running",
      startedAt: timestamp(),
      replaces: slot.evalRunId ?? slot.previousEvalRunId ?? undefined,
    };
    this.transaction(() => {
      this.db
        .insert(tables.evalRuns)
        .values({ id: value.id, state: value.state, value })
        .run();
      this.select({
        ...slot,
        evalRunId: value.id,
        judgeRunId: null,
        previousEvalRunId: undefined,
      });
    });
    return value;
  }
  finishEval(value: EvalRun) {
    if (
      value.state === "running" ||
      !value.completedAt ||
      value.elapsedMs === undefined ||
      value.elapsedMs < 0
    )
      throw new Error("Expected a finalized eval run");
    const saved = this.evalRun(value.id);
    if (!saved || saved.state !== "running")
      throw new Error("Eval run is not running");
    if (
      saved.stop &&
      JSON.stringify({ ...saved.stop, applied: value.stop?.applied }) !==
        JSON.stringify(value.stop)
    )
      throw new Error("Finalization must preserve the recorded stop request");
    this.db
      .update(tables.evalRuns)
      .set({ state: value.state, value })
      .where(eq(tables.evalRuns.id, value.id))
      .run();
  }
  requestEvalStop(id: string, stop: NonNullable<EvalRun["stop"]>) {
    const saved = this.evalRun(id);
    const check = this.judgeChecks(stop.judgeRunId).find(
      (item) => item.id === stop.checkId,
    );
    if (
      !saved ||
      saved.state !== "running" ||
      !check ||
      check.purpose !== "early" ||
      check.state !== "completed" ||
      check.decision?.kind !== "decided" ||
      check.decision.judgment.value === null
    )
      throw new Error(
        "An early stop requires a running eval and a recorded decisive check",
      );
    if (
      this.judgeRun(stop.judgeRunId)?.input.evalRunId !== id ||
      JSON.stringify(check.checkpoint) !== JSON.stringify(stop.checkpoint)
    )
      throw new Error("Early stop evidence does not belong to this eval run");
    if (saved.stop) throw new Error("An eval stop was already requested");
    this.db
      .update(tables.evalRuns)
      .set({ value: { ...saved, stop } })
      .where(eq(tables.evalRuns.id, id))
      .run();
  }
  startJudge(input: JudgeRunInput) {
    if (
      (!input.code &&
        (!input.agent || !input.model || !input.criteria.length)) ||
      (!!input.rubric &&
        (!input.agent || !input.model || !input.criteria.length)) ||
      !["llm", "code", "hybrid"].includes(input.kind) ||
      !input.runtimeHash ||
      input.protocol !== JUDGE_PROTOCOL
    )
      throw new Error(
        "Judge inputs must include their code or LLM configuration, criteria, runtime, and protocol",
      );
    const value: JudgeRun = {
      id: `judge_${randomUUID()}`,
      input,
      state: "running",
      startedAt: timestamp(),
      ...(input.mode === "monitor" ? { activity: "watching" as const } : {}),
    };
    const candidate = this.evalRun(input.evalRunId);
    if (input.mode === "monitor" && !candidate?.input.earlyStop)
      throw new Error("This eval run did not opt in to early stopping");
    if (
      !candidate ||
      (candidate.evidence?.hash !== input.evidence.hash &&
        !(
          input.mode === "monitor" &&
          this.checkpoint(candidate.id, input.evidence.hash)
        ))
    )
      throw new Error("Judge input does not match saved candidate evidence");
    this.db
      .insert(tables.judgeRuns)
      .values({ id: value.id, state: value.state, value })
      .run();
    return value;
  }
  finishJudge(value: JudgeRun) {
    if (
      value.state === "running" ||
      !value.completedAt ||
      value.elapsedMs === undefined ||
      value.elapsedMs < 0
    )
      throw new Error("Expected a finalized judge run");
    const saved = this.judgeRun(value.id);
    if (!saved || saved.state !== "running")
      throw new Error("Judge run is not running");
    if (value.state === "completed") {
      const expected = [
        ...value.input.criteria.map((criterion) => criterion.id),
        ...Object.keys(value.code?.scores ?? {}),
      ];
      const scores = value.judgment?.scores;
      if (
        !scores ||
        Array.isArray(scores) ||
        new Set(expected).size !== expected.length ||
        Object.keys(scores).length !== expected.length ||
        expected.some((id) => !Object.hasOwn(scores, id)) ||
        Object.values(scores).some(
          (score) => score.value !== null && !isScored(score.value),
        ) ||
        value.judgment!.value !== criterionMean(scores) ||
        (value.input.code && value.code?.state !== "completed")
      )
        throw new Error(
          "A completed judge run requires a valid, complete judgment",
        );
    }
    if (
      value.state === "completed" &&
      this.evalRun(value.input.evalRunId)?.evidence?.hash !==
        value.input.evidence.hash
    )
      throw new Error(
        "A completed judgment must reference the finalized eval evidence",
      );
    const checks = this.judgeChecks(value.id);
    if (checks.some((check) => check.state === "running"))
      throw new Error(
        "Finish pending judge checks before archiving the judge run",
      );
    if (value.state === "completed" && value.decisionCheckId) {
      const basis = checks.find((check) => check.id === value.decisionCheckId);
      if (
        basis?.state !== "completed" ||
        basis.decision?.kind !== "decided" ||
        JSON.stringify(basis.decision.judgment) !==
          JSON.stringify(value.judgment)
      )
        throw new Error(
          "The selected judgment must match its recorded decisive check",
        );
    }
    this.transaction(() => {
      this.db
        .update(tables.judgeRuns)
        .set({ state: value.state, value })
        .where(eq(tables.judgeRuns.id, value.id))
        .run();
      if (value.state !== "completed") return;
      const candidate = this.evalRun(value.input.evalRunId)!;
      const slot = this.slot(candidate.slotId)!;
      if (
        slot.evalRunId === candidate.id &&
        slot.judgeHash === value.input.judgeHash
      )
        this.select({ ...slot, judgeRunId: value.id });
    });
  }
  saveCheckpoint(evalRunId: string, value: EvidenceCheckpoint) {
    if (!this.evalRun(evalRunId)) throw new Error("Unknown eval run");
    const id = `${evalRunId}:${value.hash}`;
    const existing = this.checkpoint(evalRunId, value.hash);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(value))
        throw new Error("Checkpoint identity conflict");
      return;
    }
    this.db
      .insert(tables.evidenceCheckpoints)
      .values({ id, evalRunId, value })
      .run();
  }
  checkpoint(evalRunId: string, hash: string) {
    return this.db
      .select()
      .from(tables.evidenceCheckpoints)
      .where(eq(tables.evidenceCheckpoints.id, `${evalRunId}:${hash}`))
      .get()?.value;
  }
  judgeActivity(
    id: string,
    activity: JudgeRun["activity"],
    monitorError?: string,
    monitorErrorAt?: string,
    monitorLimit?: string,
  ) {
    const saved = this.judgeRun(id);
    if (!saved || saved.state !== "running")
      throw new Error("Judge run is not running");
    const value = {
      ...saved,
      activity,
      ...(activity === "finalizing"
        ? { archiveStartedAt: saved.archiveStartedAt ?? timestamp() }
        : {}),
      ...(monitorLimit ? { monitorLimit } : {}),
      ...(monitorError
        ? { monitorError, monitorErrorAt: monitorErrorAt ?? timestamp() }
        : {}),
    };
    this.db
      .update(tables.judgeRuns)
      .set({ value })
      .where(eq(tables.judgeRuns.id, id))
      .run();
  }
  startJudgeCheck(
    judgeRunId: string,
    purpose: JudgeCheck["purpose"],
    checkpoint: EvidenceCheckpoint,
  ) {
    const judge = this.judgeRun(judgeRunId);
    if (
      !judge ||
      judge.state !== "running" ||
      !this.checkpoint(judge.input.evalRunId, checkpoint.hash)
    )
      throw new Error(
        "Judge check requires a running judge and a recorded checkpoint",
      );
    if (this.judgeChecks(judgeRunId).some((check) => check.state === "running"))
      throw new Error("Only one check can run in a judge session at a time");
    const value: JudgeCheck = {
      id: `check_${randomUUID()}`,
      judgeRunId,
      purpose,
      checkpoint,
      state: "running",
      startedAt: timestamp(),
      events: { after: this.lastEvent(judgeRunId) },
    };
    this.db
      .insert(tables.judgeChecks)
      .values({ id: value.id, judgeRunId, state: value.state, value })
      .run();
    return value;
  }
  finishJudgeCheck(value: JudgeCheck) {
    const saved = this.judgeChecks(value.judgeRunId).find(
      (check) => check.id === value.id,
    );
    if (
      !saved ||
      saved.state !== "running" ||
      value.state === "running" ||
      !value.completedAt
    )
      throw new Error("Expected a finalized judge check");
    if (
      JSON.stringify(saved.checkpoint) !== JSON.stringify(value.checkpoint) ||
      saved.purpose !== value.purpose ||
      saved.startedAt !== value.startedAt ||
      saved.executionStartedAt !== value.executionStartedAt ||
      saved.events.after !== value.events.after
    )
      throw new Error("A judge check cannot change its inputs");
    if (
      value.state === "completed" &&
      (!value.decision ||
        (value.purpose === "early" &&
          value.decision.kind === "decided" &&
          value.decision.judgment.value === null))
    )
      throw new Error("Invalid judge check decision");
    this.db
      .update(tables.judgeChecks)
      .set({ state: value.state, value })
      .where(eq(tables.judgeChecks.id, value.id))
      .run();
  }
  startJudgeCheckExecution(judgeRunId: string, checkId: string): JudgeCheck {
    const check = this.judgeChecks(judgeRunId).find(
      (item) => item.id === checkId,
    );
    if (!check || check.state !== "running" || check.executionStartedAt)
      throw new Error("Expected a queued judge check");
    const value = { ...check, executionStartedAt: timestamp() };
    this.db
      .update(tables.judgeChecks)
      .set({ value })
      .where(eq(tables.judgeChecks.id, checkId))
      .run();
    return value;
  }
  judgeChecks(judgeRunId: string): JudgeCheck[] {
    return this.db
      .select()
      .from(tables.judgeChecks)
      .where(eq(tables.judgeChecks.judgeRunId, judgeRunId))
      .all()
      .map((row) => row.value);
  }
  append(event: RunEvent) {
    this.sqlite
      .query(
        "INSERT INTO events(execution_id,sequence,value) SELECT ?,coalesce(max(sequence),0)+1,? FROM events WHERE execution_id=?",
      )
      .run(event.executionId, JSON.stringify(event), event.executionId);
  }
  events(id: string, after = 0, limit = 1000) {
    const sequence = tables.events.sequence;
    return this.db
      .select({ sequence, value: tables.events.value })
      .from(tables.events)
      .where(and(eq(tables.events.executionId, id), gt(sequence, after)))
      .orderBy(asc(sequence))
      .limit(limit)
      .all()
      .map((row) => ({
        sequence: row.sequence,
        record: JSON.parse(row.value) as RunEvent,
      }));
  }
  /** Native event time bounds within an execution's event sequence. */
  eventBounds(
    id: string,
    after = 0,
    through = Number.MAX_SAFE_INTEGER,
  ): { first: number; last: number } | undefined {
    const time = "json_extract(value, '$.event.created')";
    const row = this.sqlite
      .query(
        `SELECT min(${time}) AS first, max(${time}) AS last FROM events WHERE execution_id=? AND sequence>? AND sequence<=?`,
      )
      .get(id, after, through) as { first: number | null; last: number | null };
    return row.first === null || row.last === null
      ? undefined
      : { first: Math.round(row.first), last: Math.round(row.last) };
  }
  lastEvent(id: string) {
    return (
      (
        this.sqlite
          .query(
            "SELECT max(sequence) AS last FROM events WHERE execution_id=?",
          )
          .get(id) as { last: number | null }
      ).last ?? 0
    );
  }
  recordedCost(id: string): number | undefined {
    const row = this.sqlite
      .query(
        `
      SELECT sum(cost) AS cost FROM (
        SELECT json_extract(value, '$.event.data.cost') AS cost
        FROM events WHERE execution_id=?
          AND json_extract(value, '$.event.type') IN (
            'session.step.ended', 'session.step.failed', 'session.usage.recorded'
          )
        GROUP BY json_extract(value, '$.event.id')
      )
    `,
      )
      .get(id) as { cost: number | null };
    return row.cost ?? undefined;
  }
  /** Copy finalized records verbatim; retain source event cursors for checkpoint trace links. */
  mergeFinalized(source: Results) {
    if (
      source.benchmark?.state === "running" ||
      this.benchmark?.state === "running"
    )
      throw new Error("Wait for running work before merging");
    if (
      [...source.evalRuns(), ...source.judgeRuns()].some(
        (run) => run.state === "running",
      )
    )
      throw new Error("Source has unfinished execution records");
    const existing = new Set(
      [...this.evalRuns(), ...this.judgeRuns()].map((run) => run.id),
    );
    this.transaction(() => {
      for (const table of [
        "eval_runs",
        "judge_runs",
        "evidence_checkpoints",
        "judge_checks",
      ]) {
        const rows = source.sqlite
          .query(`SELECT * FROM ${table}`)
          .all() as Record<string, string>[];
        for (const row of rows) {
          const saved = this.sqlite
            .query(`SELECT value FROM ${table} WHERE id=?`)
            .get(row.id) as { value: string } | null;
          if (saved) {
            if (saved.value !== row.value)
              throw new Error(`Conflicting immutable record ${row.id}`);
            continue;
          }
          const columns = Object.keys(row);
          this.sqlite
            .query(
              `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
            )
            .run(...columns.map((key) => row[key]));
        }
      }
      const insert = this.sqlite.query(
        "INSERT INTO events(execution_id,sequence,value) VALUES(?,?,?)",
      );
      const events = source.sqlite
        .query("SELECT * FROM events ORDER BY sequence")
        .all() as Array<{
        sequence: number;
        execution_id: string;
        value: string;
      }>;
      for (const event of events)
        if (!existing.has(event.execution_id))
          insert.run(event.execution_id, event.sequence, event.value);
      for (const revision of [...source.revisions(), source.benchmark!])
        this.db.insert(tables.revisions).values({ value: revision }).run();
      for (const slot of source.slots())
        if (!this.slot(slot.id)?.evalRunId) this.select(slot);
    });
  }
  transaction<T>(work: () => T): T {
    return this.sqlite.transaction(work).immediate();
  }
  readSnapshot<T>(work: () => T): T {
    return this.sqlite.transaction(work).deferred();
  }
  close() {
    if (!this.closed) {
      this.closed = true;
      this.sqlite.close(true);
    }
  }
  [Symbol.dispose]() {
    this.close();
  }
}
