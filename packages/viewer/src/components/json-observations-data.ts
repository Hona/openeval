import type { JsonValue } from "@hona/openeval";

export type ObservationRecord = Record<string, JsonValue>;
export function observationTable(value: JsonValue) {
  if (!Array.isArray(value) || !value.length || !value.every(item => item && typeof item === "object" && !Array.isArray(item))) return undefined;
  const rows = value as ObservationRecord[];
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return { rows: rows.slice(0, 50), columns: columns.slice(0, 8), omittedRows: Math.max(0, rows.length - 50), omittedColumns: Math.max(0, columns.length - 8) };
}
