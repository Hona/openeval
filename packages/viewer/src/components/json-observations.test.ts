import { expect, test } from "bun:test";
import { observationLabel, observationTable } from "./json-observations-data";

test("tables preserve author-owned columns and values without inventing scores", () => {
  expect(observationTable([{ name: "Input", pass: true }, { name: "Output", pass: false, error: "Missing row" }])).toEqual({
    columns: ["name", "pass", "error"], rows: [{ name: "Input", pass: true }, { name: "Output", pass: false, error: "Missing row" }], omittedRows: 0, omittedColumns: 0,
  });
  expect(observationTable(["plain", "strings"])).toBeUndefined();
  expect(observationTable(null)).toBeUndefined();
});

test("large observations have explicit display bounds while raw data is unchanged", () => {
  const values = Array.from({ length: 80 }, (_, index) => ({ index }));
  expect(observationTable(values)?.rows).toHaveLength(50);
  expect(observationTable(values)?.omittedRows).toBe(30);
  expect(values).toHaveLength(80);
});

test("labels are readable without changing author keys", () => {
  expect(observationLabel("elapsedMs")).toBe("Elapsed ms");
  expect(observationLabel("reported_coverage")).toBe("Reported coverage");
  expect(observationLabel("pass")).toBe("Pass");
  expect(observationLabel("maximumJumpPx")).toBe("Maximum jump px");
});
