import { createMemo, createSignal, For, Show, type JSX } from "solid-js";
import { Button } from "@opencode/ui/button";
import { Icon } from "@opencode/ui/icon";
import { IconButton } from "@opencode/ui/icon-button";
import { Tabs } from "@opencode/ui/tabs";
import { modelScore } from "@hona/openeval/view";
import type { Block } from "./content";
import { screenshotDimensions, type ScreenshotName } from "./media";

/** Inactive panels still reserve their natural size, but cannot receive focus. */
export function StableTabPanel(props: {
  value: string;
  selected: string;
  children: JSX.Element;
}) {
  return (
    <Tabs.Content
      value={props.value}
      forceMount
      class="stable-tab-panel"
      inert={props.selected !== props.value}
      aria-hidden={props.selected !== props.value}
    >
      {props.children}
    </Tabs.Content>
  );
}

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
  caption?: string;
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
      // Embedded browsers can deny the async API while allowing a copy command.
      const focused = document.activeElement as HTMLElement | null;
      const input = document.createElement("textarea");
      input.value = props.text;
      input.readOnly = true;
      input.tabIndex = -1;
      input.style.cssText =
        "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
      document.body.append(input);
      try {
        input.focus({ preventScroll: true });
        input.select();
        setStatus(document.execCommand("copy") ? "copied" : "failed");
      } catch {
        setStatus("failed");
      } finally {
        input.remove();
        focused?.focus({ preventScroll: true });
      }
    }
  };
  return (
    <div class="copy-control">
      <Show
        when={props.caption}
        fallback={
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
        }
      >
        <Button
          size="small"
          variant="outline"
          aria-label={status() === "copied" ? "Copied" : props.label}
          title={
            status() === "failed" ? "Could not copy. Try again." : props.label
          }
          onClick={copy}
        >
          <span>
            {status() === "copied"
              ? "Copied"
              : status() === "failed"
                ? "Try again"
                : props.caption}
          </span>
          <Icon name={status() === "copied" ? "check" : "copy"} />
        </Button>
      </Show>
      <span
        class={props.compact ? "sr-only" : "copy-feedback"}
        aria-live="polite"
      >
        {status() === "copied"
          ? "Copied"
          : status() === "failed"
            ? props.caption
              ? "Could not copy. Try again."
              : "Select text to copy"
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
    <div
      class="code-block"
      classList={{
        "code-bare": props.bare,
        "code-prose": props.language === "markdown",
      }}
    >
      <Show when={!props.bare}>
        <div class="code-heading">
          <span>
            <Icon name={props.language === "shell" ? "console" : "code"} />
            <span class="code-filename" title={props.file}>
              {props.file}
            </span>
          </span>
          <CopyButton text={props.code} label={`Copy ${props.file}`} compact />
        </div>
      </Show>
      <pre aria-label={props.file} tabIndex={0}>
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
    <div
      class="table-scroll"
      classList={{ "wide-table": props.columns.length > 2 }}
      role="region"
      aria-label={props.columns.join(" / ")}
      tabIndex={0}
    >
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
  image: ScreenshotName;
  alt: string;
  caption: string;
  eager?: boolean;
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
          width={screenshotDimensions[props.image].width}
          height={screenshotDimensions[props.image].height}
          loading={props.eager ? "eager" : "lazy"}
          decoding="async"
        />
      </a>
      <figcaption>
        <Icon name="photo" />
        <span class="screenshot-caption">{props.caption}</span>
        <a
          class="screenshot-open"
          href={`/images/${props.image}`}
          target="_blank"
          rel="noreferrer"
        >
          Open full size <Icon name="arrow-up-right" />
        </a>
      </figcaption>
    </figure>
  );
}

export function ScoreCalculator() {
  const definitions = [
    { eval: "sql", criterion: "asked_dialect", name: "Asks for dialect" },
    { eval: "sql", criterion: "safe_parameters", name: "Bound parameters" },
    { eval: "summary", criterion: "actionable", name: "Actionable summary" },
  ];
  const [values, setValues] = createSignal<Array<0 | 1 | null>>([1, 0, 1]);
  const score = createMemo(() =>
    modelScore(
      "example",
      definitions.map((criterion, index) => ({
        ...criterion,
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
        Score explorer<span>Illustration · one repetition per criterion</span>
      </div>
      <div class="calculator-inputs">
        <For each={definitions}>
          {(criterion, index) => (
            <div>
              <small>
                {criterion.eval === "sql" ? "SQL query" : "Issue summary"}
              </small>
              <strong>{criterion.name}</strong>
              <Button
                size="small"
                variant="outline"
                class={`verdict-button verdict-${values()[index()] === null ? "unknown" : values()[index()] ? "pass" : "fail"}`}
                aria-label={`${criterion.name}: ${label(values()[index()])}. Change decision.`}
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
        Select a decision to cycle through pass → fail → unknown. The
        calculation uses OpenEval's score projection.
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
