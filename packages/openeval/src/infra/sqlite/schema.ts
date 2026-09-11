import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import type {
  BenchmarkRun,
  EvalRun,
  JudgeRun,
  Slot,
  EvidenceCheckpoint,
  JudgeCheck,
} from "../../types";

export const benchmarkRuns = sqliteTable("benchmark_runs", {
  id: text("id").primaryKey(),
  value: text("value", { mode: "json" }).$type<BenchmarkRun>().notNull(),
});
export const revisions = sqliteTable("revisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  value: text("value", { mode: "json" }).$type<BenchmarkRun>().notNull(),
});
export const slots = sqliteTable("slots", {
  id: text("id").primaryKey(),
  value: text("value", { mode: "json" }).$type<Slot>().notNull(),
});
export const evalRuns = sqliteTable("eval_runs", {
  id: text("id").primaryKey(),
  state: text("state").notNull(),
  value: text("value", { mode: "json" }).$type<EvalRun>().notNull(),
});
export const judgeRuns = sqliteTable("judge_runs", {
  id: text("id").primaryKey(),
  state: text("state").notNull(),
  value: text("value", { mode: "json" }).$type<JudgeRun>().notNull(),
});
export const evidenceCheckpoints = sqliteTable("evidence_checkpoints", {
  id: text("id").primaryKey(),
  evalRunId: text("eval_run_id").notNull(),
  value: text("value", { mode: "json" }).$type<EvidenceCheckpoint>().notNull(),
});
export const judgeChecks = sqliteTable("judge_checks", {
  id: text("id").primaryKey(),
  judgeRunId: text("judge_run_id").notNull(),
  state: text("state").notNull(),
  value: text("value", { mode: "json" }).$type<JudgeCheck>().notNull(),
});
export const events = sqliteTable(
  "events",
  {
    sequence: integer("sequence").notNull(),
    executionId: text("execution_id").notNull(),
    value: text("value").notNull(),
  },
  (table) => [primaryKey({ columns: [table.executionId, table.sequence] })],
);
