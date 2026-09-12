import { createMemo, createSignal, For, Show, type JSX } from "solid-js";
import { Button } from "@opencode/ui/button";
import { Icon } from "@opencode/ui/icon";
import { IconButton } from "@opencode/ui/icon-button";
import { Badge } from "@opencode/ui/badge";
import { Tabs } from "@opencode/ui/tabs";
import { modelScore } from "@hona/openeval/view";
import { benchmark, install, prompt, query, rubric } from "./examples";
import type { Block } from "./content";

function Highlight(props: { line: string; language?: string }) {
  const tokens = () =>
    props.line.split(
      /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`|\/\/.*$|^#+.*$|\b(?:import|export|default|from|const|true|false|return|satisfies|type|if|await)\b|\b\d+(?:_\d+)*(?:\.\d+)?\b|\b(?:SELECT|FROM|WHERE|ORDER BY|LIMIT|CREATE TABLE|NOT NULL|PRIMARY KEY|DESC)\b)/g,
    );
  const kind = (token: string) =>
    /^("|'|`)/.test(token)
      ? "string"
      : token.startsWith("//")
        ? "comment"
        : token.startsWith("#")
          ? "heading"
          : /^\d/.test(token)
            ? "number"
            : /^(import|export|default|from|const|true|false|return|satisfies|type|if|await|SELECT|FROM|WHERE|ORDER BY|LIMIT|CREATE TABLE|NOT NULL|PRIMARY KEY|DESC)$/.test(
                  token,
                )
              ? "keyword"
              : "plain";
  return (
    <For each={tokens()}>
      {(token) => <span class={`token-${kind(token)}`}>{token}</span>}
    </For>
  );
}

export function CopyButton(props: {
  text: string;
  label: string;
  compact?: boolean;
}) {
  const [status, setStatus] = createSignal<"idle" | "copied" | "failed">(
    "idle",
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.text);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };
  return (
    <div class="copy-control">
      <IconButton
        size="small"
        variant="ghost-muted"
        aria-label={status() === "copied" ? "Copied" : props.label}
        title={
          status() === "failed"
            ? "Select and copy the code manually"
            : props.label
        }
        onClick={copy}
        icon={<Icon name={status() === "copied" ? "check" : "copy"} />}
      />
      <span
        class={props.compact ? "sr-only" : "copy-feedback"}
        aria-live="polite"
      >
        {status() === "copied"
          ? "Copied"
          : status() === "failed"
            ? "Select text to copy"
            : ""}
      </span>
    </div>
  );
}

export function CodeBlock(props: {
  file: string;
  code: string;
  language?: string;
  bare?: boolean;
}) {
  return (
    <div class="code-block" classList={{ "code-bare": props.bare }}>
      <div class="code-heading">
        <span>
          <Icon name={props.language === "shell" ? "console" : "code"} />
          {props.file}
        </span>
        <CopyButton text={props.code} label={`Copy ${props.file}`} compact />
      </div>
      <pre aria-label={props.file}>
        <code>
          <For each={props.code.split("\n")}>
            {(line, index) => (
              <span class="code-line">
                <span class="line-number" aria-hidden="true">
                  {index() + 1}
                </span>
                <span class="line-content">
                  <Highlight line={line} language={props.language} />
                  {"\n"}
                </span>
              </span>
            )}
          </For>
        </code>
      </pre>
    </div>
  );
}

export function InstallCommand() {
  return (
    <div class="install-command">
      <span class="terminal-prompt" aria-hidden="true">
        $
      </span>
      <code>{install}</code>
      <CopyButton text={install} label="Copy install command" compact />
    </div>
  );
}

export function Flow(props: { steps: string[] }) {
  return (
    <ol class="flow" aria-label="Workflow">
      <For each={props.steps}>
        {(step, index) => (
          <li>
            <span>{step}</span>
            <Show when={index() < props.steps.length - 1}>
              <Icon name="arrow-right" />
            </Show>
          </li>
        )}
      </For>
    </ol>
  );
}

export function DataTable(props: { columns: string[]; rows: string[][] }) {
  return (
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <For each={props.columns}>
              {(column) => <th scope="col">{column}</th>}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={props.rows}>
            {(row) => (
              <tr>
                <For each={row}>
                  {(cell, index) =>
                    index() === 0 ? (
                      <th scope="row">{cell}</th>
                    ) : (
                      <td>{cell}</td>
                    )
                  }
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

export function Screenshot(props: {
  image: string;
  alt: string;
  caption: string;
}) {
  return (
    <figure class="screenshot">
      <a
        href={`/images/${props.image}`}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open full-size image: ${props.alt}`}
      >
        <img
          src={`/images/${props.image}`}
          alt={props.alt}
          loading="lazy"
          decoding="async"
        />
      </a>
      <figcaption>
        <Icon name="photo" />
        {props.caption}
        <span>Open full size ↗</span>
      </figcaption>
    </figure>
  );
}

export function ScoreCalculator() {
  const definitions = [
    { eval: "sql", metric: "asked_dialect", name: "Asks for dialect" },
    { eval: "sql", metric: "safe_parameters", name: "Bound parameters" },
    { eval: "summary", metric: "actionable", name: "Actionable summary" },
  ];
  const [values, setValues] = createSignal<Array<0 | 1 | null>>([1, 0, 1]);
  const score = createMemo(() =>
    modelScore(
      "example",
      definitions.map((metric, index) => ({
        ...metric,
        value: values()[index],
        expected: 1,
        scored: values()[index] === null ? 0 : 1,
        passed: values()[index] ?? 0,
        scoredSum: values()[index] ?? 0,
      })),
    ),
  );
  const toggle = (index: number) =>
    setValues((current) =>
      current.map((value, i) =>
        i === index ? (value === 1 ? 0 : value === 0 ? null : 1) : value,
      ),
    );
  const label = (value: number | null) =>
    value === null ? "Unknown" : value ? "Pass" : "Fail";
  return (
    <div class="calculator">
      <div class="panel-label">
        <Icon name="status" />
        Score explorer<span>Illustration · one repetition per metric</span>
      </div>
      <div class="calculator-inputs">
        <For each={definitions}>
          {(metric, index) => (
            <div>
              <small>
                {metric.eval === "sql" ? "SQL query" : "Issue summary"}
              </small>
              <strong>{metric.name}</strong>
              <Button
                size="small"
                variant="outline"
                class={`verdict-button verdict-${values()[index()] === null ? "unknown" : values()[index()] ? "pass" : "fail"}`}
                aria-label={`${metric.name}: ${label(values()[index()])}. Change decision.`}
                onClick={() => toggle(index())}
              >
                {label(values()[index()])}
                <Icon name="chevron-down" />
              </Button>
            </div>
          )}
        </For>
      </div>
      <div class="calculator-output" aria-live="polite">
        <div>
          <small>Benchmark score</small>
          <strong>
            {score().percentage === null
              ? `${score().bounds.lower.toFixed(0)}–${score().bounds.upper.toFixed(0)}%`
              : `${score().percentage!.toFixed(0)}%`}
          </strong>
        </div>
        <div
          class="score-meter"
          role="img"
          aria-label={`Earned ${score().bounds.lower.toFixed(0)} percent, possible final score up to ${score().bounds.upper.toFixed(0)} percent`}
        >
          <span
            class="score-earned"
            style={{ width: `${score().bounds.lower}%` }}
          />
          <span
            class="score-unresolved"
            style={{
              left: `${score().bounds.lower}%`,
              width: `${score().bounds.upper - score().bounds.lower}%`,
            }}
          />
        </div>
        <span>
          {score().percentage === null
            ? "Waiting on unknowns"
            : "Equal eval weights"}
        </span>
      </div>
      <p class="utility-note">
        Click a decision to cycle through pass → fail → unknown. The calculation
        uses OpenEval's score projection.
      </p>
    </div>
  );
}

export function RenderBlock(props: { block: Block }) {
  const block = props.block;
  if (block.type === "text") return <p>{block.text}</p>;
  if (block.type === "code") return <CodeBlock {...block} />;
  if (block.type === "table") return <DataTable {...block} />;
  if (block.type === "flow") return <Flow steps={block.steps} />;
  if (block.type === "image") return <Screenshot {...block} />;
  if (block.type === "calculator") return <ScoreCalculator />;
  return (
    <aside class="note">
      <Icon name="info" />
      <div>
        <strong>{block.title}</strong>
        <p>{block.text}</p>
      </div>
    </aside>
  );
}

export function Workbench() {
  const [file, setFile] = createSignal("judge.md");
  const [response, setResponse] = createSignal("asks");
  const [citation, setCitation] = createSignal("asked_dialect");
  const files = {
    "prompt.md": prompt,
    "judge.md": rubric,
    "benchmark.ts": benchmark,
  };
  const pass = () => response() === "asks";
  return (
    <section class="workbench" aria-label="Interactive eval example">
      <div class="workbench-title">
        <span>
          <Icon name="flask" />
          ask-dialect
        </span>
        <Badge>interactive example</Badge>
        <span class="quiet">No model calls</span>
      </div>
      <div class="workbench-grid">
        <aside class="file-explorer" aria-label="Example files">
          <div class="panel-label">EXPLORER</div>
          <span class="tree-folder">
            <Icon name="chevron-down" />
            <Icon name="folder" />
            my-benchmark
          </span>
          <button
            classList={{ selected: file() === "benchmark.ts" }}
            onClick={() => setFile("benchmark.ts")}
          >
            <span class="file-type ts">TS</span>benchmark.ts
          </button>
          <span class="tree-folder indent">
            <Icon name="chevron-down" />
            <Icon name="folder" />
            evals
          </span>
          <span class="tree-folder indent-2">
            <Icon name="chevron-down" />
            ask-dialect
          </span>
          <For each={["prompt.md", "judge.md"]}>
            {(name) => (
              <button
                class="indent-2"
                classList={{ selected: file() === name }}
                onClick={() => setFile(name)}
              >
                <span class="file-type md">M↓</span>
                {name}
              </button>
            )}
          </For>
          <div class="explorer-hint">
            <Icon name="shield" />
            <span>Only the prompt reaches the candidate.</span>
          </div>
        </aside>
        <div class="workbench-editor">
          <Tabs value={file()} onChange={setFile} variant="line">
            <Tabs.List aria-label="Example source files">
              <For each={Object.keys(files)}>
                {(name) => <Tabs.Trigger value={name}>{name}</Tabs.Trigger>}
              </For>
            </Tabs.List>
            <For each={Object.entries(files)}>
              {([name, value]) => (
                <Tabs.Content value={name}>
                  <CodeBlock
                    file={name}
                    code={value}
                    language={name.endsWith("ts") ? "typescript" : "markdown"}
                    bare
                  />
                </Tabs.Content>
              )}
            </For>
          </Tabs>
          <div class="editor-hint">
            <Icon name="arrow-right" />
            <a href="/docs/rubrics/">
              Write criteria that accept equivalent valid answers
            </a>
          </div>
        </div>
        <div class="workbench-evidence">
          <div class="panel-label">
            <Icon name="code" />
            CANDIDATE RESPONSE
          </div>
          <div class="response-switch">
            <Button
              size="small"
              variant={pass() ? "neutral" : "ghost-muted"}
              aria-pressed={pass()}
              onClick={() => setResponse("asks")}
            >
              Asks first
            </Button>
            <Button
              size="small"
              variant={!pass() ? "neutral" : "ghost-muted"}
              aria-pressed={!pass()}
              onClick={() => setResponse("assumes")}
            >
              Assumes dialect
            </Button>
          </div>
          <p
            class="response-quote"
            classList={{ cited: citation() === "asked_dialect" }}
          >
            {pass()
              ? "“Which database are you using—PostgreSQL, MySQL, SQLite, or SQL Server?”"
              : "“Here is the PostgreSQL query for your orders.”"}
          </p>
          <span class="response-context">
            {pass()
              ? "If PostgreSQL, here is a parameterized draft:"
              : "The answer continues with a bound parameter:"}
          </span>
          <pre
            class="response-code"
            classList={{ cited: citation() === "safe_parameters" }}
          >
            <code>
              <For each={query.split("\n")}>
                {(line) => (
                  <>
                    <Highlight line={line} language="sql" />
                    {"\n"}
                  </>
                )}
              </For>
            </code>
          </pre>
          <p class="response-footnote">
            Bind <code>$1</code> to the customer ID with your database driver.
          </p>
          <div class="judgment-heading">
            <Icon name="shield" />
            <strong>Judge decisions</strong>
            <span>{pass() ? "2 / 2" : "1 / 2"} passed</span>
          </div>
          <button
            class="metric-decision"
            classList={{ selected: citation() === "asked_dialect" }}
            onClick={() => setCitation("asked_dialect")}
          >
            <span>Asks for SQL dialect</span>
            <span class={pass() ? "pass" : "fail"}>
              <Icon name={pass() ? "check" : "close"} />
              {pass() ? "Pass" : "Fail"}
            </span>
          </button>
          <button
            class="metric-decision"
            classList={{ selected: citation() === "safe_parameters" }}
            onClick={() => setCitation("safe_parameters")}
          >
            <span>Uses bound parameters</span>
            <span class="pass">
              <Icon name="check" />
              Pass
            </span>
          </button>
          <p class="citation-help">
            <Icon name="link" />
            Click a metric to locate its response evidence.
          </p>
        </div>
      </div>
      <div class="workbench-status">
        <span>
          <i class="status-dot" />
          Illustrative recording
        </span>
        <span>1 eval · 2 independent metrics</span>
        <a href="/docs/quickstart/">
          Make this your first eval <Icon name="arrow-right" />
        </a>
      </div>
    </section>
  );
}
