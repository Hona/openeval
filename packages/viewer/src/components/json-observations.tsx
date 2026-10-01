import { For, Show } from "solid-js";
import type { JsonValue } from "@hona/openeval";
import { observationTable, type ObservationRecord } from "./json-observations-data";
import "./json-observations.css";

const label = (key: string) => key.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2");
function Value(props: { value: JsonValue; name?: string }) {
  const table = () => observationTable(props.value);
  return <Show when={table()} fallback={
    Array.isArray(props.value) ? <ul class="observation-list"><For each={props.value.slice(0, 50)}>{item => <li>{typeof item === "object" ? JSON.stringify(item) : String(item)}</li>}</For></ul> :
      typeof props.value === "object" && props.value !== null ? <details><summary>Read details</summary><pre>{JSON.stringify(props.value, null, 2)}</pre></details> :
      <span classList={{ "observation-pass": props.name === "pass" && props.value === true, "observation-fail": props.name === "pass" && props.value === false }}>{
        props.value === null ? "Not available" : typeof props.value === "boolean" ? props.name === "pass" ? props.value ? "Pass" : "Fail" : props.value ? "Yes" : "No" : String(props.value)
      }</span>
  }>{data => <div class="observation-table-scroll"><table class="observation-table">
    <thead><tr><For each={data().columns}>{key => <th scope="col">{label(key)}</th>}</For></tr></thead>
    <tbody><For each={data().rows}>{row => <tr><For each={data().columns}>{key => <td><Value value={row[key] ?? null} name={key} /></td>}</For></tr>}</For></tbody>
  </table><Show when={data().omittedRows || data().omittedColumns}><p class="observation-note">More data is retained in the returned JSON ({data().omittedRows} rows, {data().omittedColumns} columns not shown here).</p></Show></div>}</Show>;
}

/** Author-owned JSON remains data, not extra scoring semantics or an HTML template. */
export function JsonObservations(props: { values: ObservationRecord }) {
  return <dl class="verification-measurements json-observations"><For each={Object.entries(props.values)}>{([key,value]) => <>
    <dt>{label(key)}</dt><dd><Value value={value} /></dd>
  </>}</For></dl>;
}
