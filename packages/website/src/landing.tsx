import { createMemo, createSignal, For, Show } from "solid-js";
import { Icon } from "@opencode/ui/icon";
import { Tabs } from "@opencode/ui/tabs";
import { ProviderIcon } from "@opencode/ui/provider-icon";
import { modelScore, type ModelScore } from "@hona/openeval/view";
import { ScoreChart } from "../../viewer/src/components/score-chart";
import {
  duration,
  formatCost,
  modelName,
  provider,
} from "../../viewer/src/model";
import { CodeBlock, CopyButton, StableTabPanel } from "./components";
import { codeJudge, codePrompt, prompt, rubric } from "./examples";
import agentPrompt from "../../../agent-start.md?raw";
import { overview } from "./content";
import comparison from "../demo/benchmark";
import comparisonSource from "../demo/benchmark.ts?raw";

const run = "bunx --bun @hona/openeval run";

type Sample = {
  model: (typeof comparison.models)[number];
  passes: Record<string, number>;
  costUSD?: number;
  toolCalls?: number;
  contextTokens?: number;
  durationMs?: number;
};

const evals = {
  "ask-dialect": [
    { criterion: "asked_dialect", name: "Asks for the SQL dialect" },
    { criterion: "safe_parameters", name: "Uses bound parameters" },
  ],
  "exact-answer": [{ criterion: "correct_answer", name: "Correct answer" }],
};
const repetitions = comparison.repetitions;
// Example outcomes reproduce the author's reported model percentages.
// Big Pickle's outcome is an illustration, not a collected result.
const samples: Sample[] = [
  {
    model: comparison.models[0],
    passes: { asked_dialect: 8, safe_parameters: 9, correct_answer: 8 },
    costUSD: 0.91,
    toolCalls: 14,
    contextTokens: 41_200,
    durationMs: 312_000,
  },
  {
    model: comparison.models[1],
    passes: { asked_dialect: 7, safe_parameters: 8, correct_answer: 6 },
    costUSD: 1.34,
    toolCalls: 18,
    contextTokens: 52_400,
    durationMs: 401_000,
  },
  {
    model: comparison.models[2],
    passes: { asked_dialect: 4, safe_parameters: 4, correct_answer: 4 },
    costUSD: 0.22,
    toolCalls: 9,
    contextTokens: 28_100,
    durationMs: 148_000,
  },
  {
    model: comparison.models[3],
    passes: { asked_dialect: 6, safe_parameters: 7, correct_answer: 6 },
    costUSD: 0.18,
    toolCalls: 22,
    contextTokens: 61_000,
    durationMs: 530_000,
  },
  {
    model: comparison.models[4],
    passes: { asked_dialect: 5, safe_parameters: 5, correct_answer: 5 },
    costUSD: 0.05,
    toolCalls: 11,
    contextTokens: 33_000,
    durationMs: 205_000,
  },
  {
    model: comparison.models[5],
    passes: { asked_dialect: 7, safe_parameters: 7, correct_answer: 6 },
  },
];

const components = (sample: Sample, only?: string) =>
  Object.entries(evals)
    .filter(([id]) => !only || id === only)
    .flatMap(([id, criteria]) =>
      criteria.map((item) => {
        const passed = sample.passes[item.criterion];
        return {
          eval: id,
          ...item,
          value: passed / repetitions,
          scored: repetitions,
          expected: repetitions,
          passed,
          scoredSum: passed,
        };
      }),
    );

const observed = (
  value: number | undefined,
  format: (value: number) => string = String,
) => (value === undefined ? "Not run" : format(value));

/** The viewer's score chart, mounted with sample data and its own controls. */
export function ResultsCard() {
  const [view, setView] = createSignal("benchmark");
  const [selected, setSelected] = createSignal<string>(samples[0].model);
  const scores = createMemo<ModelScore[]>(() =>
    samples.map((sample) =>
      modelScore(
        sample.model,
        components(sample, view() === "benchmark" ? undefined : view()),
      ),
    ),
  );
  const detail = () => samples.find((s) => s.model === selected())!;
  return (
    <section class="results-card" aria-label="Sample benchmark results">
      <div class="results-card-bar">
        <Tabs variant="pill" value={view()} onChange={setView}>
          <Tabs.List aria-label="Benchmark or eval breakdown">
            <Tabs.Trigger value="benchmark">Benchmark</Tabs.Trigger>
            <For each={Object.keys(evals)}>
              {(id) => <Tabs.Trigger value={id}>{id}</Tabs.Trigger>}
            </For>
          </Tabs.List>
        </Tabs>
        <span>
          Example data · 2 evals · {samples.length} models · {repetitions}{" "}
          repetitions
        </span>
      </div>
      <ScoreChart
        scores={scores()}
        criteria={view() !== "benchmark"}
        onSelect={setSelected}
      />
      <div class="results-card-foot">
        <div class="results-card-detail" aria-live="polite">
          <span class="results-card-model">
            <ProviderIcon id={provider(detail().model)} />
            <strong>{modelName(detail().model)}</strong>
          </span>
          <dl>
            <div>
              <dt>Cost</dt>
              <dd>{observed(detail().costUSD, formatCost)}</dd>
            </div>
            <div>
              <dt>Tool calls</dt>
              <dd>{observed(detail().toolCalls)}</dd>
            </div>
            <div>
              <dt>Context</dt>
              <dd>
                {observed(
                  detail().contextTokens,
                  (value) => `${Math.round(value / 1000)}k tokens`,
                )}
              </dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{observed(detail().durationMs, duration)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}

type JudgeFile = "judge.md" | "judge.ts";

function TaskCode(props: { judge: JudgeFile }) {
  return (
    <div class="guide-task-code">
      <For each={["judge.md", "judge.ts"] as const}>
        {(file) => (
          <div aria-hidden={props.judge !== file} inert={props.judge !== file}>
            <CodeBlock
              file="prompt.md"
              code={file === "judge.md" ? prompt : codePrompt}
              language="markdown"
            />
          </div>
        )}
      </For>
    </div>
  );
}

function JudgeChoice(props: {
  value: JudgeFile;
  onChange: (value: JudgeFile) => void;
}) {
  const files = { "judge.md": rubric, "judge.ts": codeJudge };
  return (
    <div class="guide-judge">
      <Tabs
        variant="line"
        value={props.value}
        onChange={(value) => props.onChange(value as JudgeFile)}
      >
        <div class="guide-judge-toolbar">
          <Tabs.List aria-label="Judge type">
            <For each={Object.keys(files)}>
              {(file) => <Tabs.Trigger value={file}>{file}</Tabs.Trigger>}
            </For>
          </Tabs.List>
          <Show when={props.value} keyed>
            {(file) => (
              <CopyButton text={files[file]} label={`Copy ${file}`} compact />
            )}
          </Show>
        </div>
        <div class="stable-tabs-panels">
          <For each={Object.entries(files)}>
            {([file, code]) => (
              <StableTabPanel value={file} selected={props.value}>
                <CodeBlock
                  file={file}
                  code={code}
                  language={file === "judge.md" ? "markdown" : "typescript"}
                  bare
                />
              </StableTabPanel>
            )}
          </For>
        </div>
      </Tabs>
    </div>
  );
}

function Start() {
  return (
    <div class="lp-actions">
      <div class="agent-prompt">
        <CopyButton
          text={agentPrompt}
          label="Copy agent prompt"
          caption="Agent prompt"
          compact
        />
      </div>
      <a class="action-link" href="/docs/quickstart/">
        Human quick start <Icon name="arrow-right" />
      </a>
    </div>
  );
}

function RunCommand() {
  return (
    <div class="lp-command">
      <span class="terminal-prompt" aria-hidden="true">
        $
      </span>
      <code>{run}</code>
      <CopyButton text={run} label="Copy run command" compact />
    </div>
  );
}

const steps = ["Task", "Judge", "Run", "Inspect", "Compare"] as const;
type Step = (typeof steps)[number];
const stepId = (step: Step) => `guide-${step.toLowerCase()}`;

function GuidedSteps() {
  const [judge, setJudge] = createSignal<JudgeFile>("judge.md");

  const content = (step: Step) => {
    if (step === "Task") return <TaskCode judge={judge()} />;
    if (step === "Judge")
      return <JudgeChoice value={judge()} onChange={setJudge} />;
    if (step === "Run") return <RunCommand />;
    if (step === "Inspect") return <ResultsCard />;
    return (
      <CodeBlock
        file="benchmark.ts"
        code={comparisonSource}
        language="typescript"
      />
    );
  };

  return (
    <div class="guide">
      <ol class="guide-steps">
        <For each={steps}>
          {(step, index) => (
            <li id={stepId(step)} class="guide-step">
              <h2 class="guide-label">
                <span class="guide-number" aria-hidden="true">
                  {String(index() + 1).padStart(2, "0")}
                </span>
                {step}
              </h2>
              <div class="guide-body">{content(step)}</div>
            </li>
          )}
        </For>
      </ol>
    </div>
  );
}

export function Landing() {
  return (
    <div class="lp">
      <header class="lp-hero">
        <h1>{overview.title}</h1>
        <p>{overview.description}</p>
        <Start />
      </header>
      <GuidedSteps />
    </div>
  );
}
