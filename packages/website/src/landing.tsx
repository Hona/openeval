import { createMemo, createSignal, For, Show } from "solid-js";
import { Icon } from "@opencode/ui/icon";
import { Tabs } from "@opencode/ui/tabs";
import { ProviderIcon } from "@opencode/ui/provider-icon";
import { ScoreChart } from "../../viewer/src/components/score-chart";
import { modelName, provider } from "../../viewer/src/model";
import { CodeBlock, CopyButton, StableTabPanel } from "./components";
import agentPrompt from "../../../agent-start.md?raw";
import { overview } from "./content";
import comparisonSource from "../demo/benchmark.ts?raw";
import {
  exampleMetrics,
  exampleScores,
  resultViews,
  resultsDescription,
  samples,
} from "../demo/results";
import {
  guideActions,
  guideComparison,
  guideExamples,
  guideJudgeFiles,
  guideRun,
  guideSteps,
  guideStepId,
  type GuideJudge,
  type GuideStep,
} from "./overview-content";

/** The viewer's score chart, mounted with sample data and its own controls. */
export function ResultsCard() {
  const [view, setView] = createSignal("benchmark");
  const [selected, setSelected] = createSignal<string>(samples[0].model);
  const scores = createMemo(() => exampleScores(view()));
  const detail = () => samples.find((s) => s.model === selected())!;
  return (
    <section class="results-card" aria-label="Sample benchmark results">
      <div class="results-card-bar">
        <Tabs variant="pill" value={view()} onChange={setView}>
          <Tabs.List aria-label="Benchmark or eval breakdown">
            <For each={resultViews}>
              {(view) => (
                <Tabs.Trigger value={view.id}>{view.label}</Tabs.Trigger>
              )}
            </For>
          </Tabs.List>
        </Tabs>
        <span>{resultsDescription}</span>
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
            <For each={exampleMetrics(detail())}>
              {(metric) => (
                <div>
                  <dt>{metric.label}</dt>
                  <dd>{metric.value}</dd>
                </div>
              )}
            </For>
          </dl>
        </div>
      </div>
    </section>
  );
}

function TaskCode(props: { judge: GuideJudge }) {
  return (
    <div class="guide-task-code">
      <For each={guideJudgeFiles}>
        {(file) => (
          <div aria-hidden={props.judge !== file} inert={props.judge !== file}>
            <CodeBlock
              {...guideExamples[file].prompt}
              file={guideExamples[file].prompt.file.split("/").at(-1)!}
            />
          </div>
        )}
      </For>
    </div>
  );
}

function JudgeChoice(props: {
  value: GuideJudge;
  onChange: (value: GuideJudge) => void;
}) {
  return (
    <div class="guide-judge">
      <Tabs
        variant="line"
        value={props.value}
        onChange={(value) => props.onChange(value as GuideJudge)}
      >
        <div class="guide-judge-toolbar">
          <Tabs.List aria-label="Judge type">
            <For each={guideJudgeFiles}>
              {(file) => <Tabs.Trigger value={file}>{file}</Tabs.Trigger>}
            </For>
          </Tabs.List>
          <Show when={props.value} keyed>
            {(file) => (
              <CopyButton
                text={guideExamples[file].judge.code}
                label={`Copy ${file}`}
                compact
              />
            )}
          </Show>
        </div>
        <div class="stable-tabs-panels">
          <For each={guideJudgeFiles}>
            {(file) => (
              <StableTabPanel value={file} selected={props.value}>
                <CodeBlock {...guideExamples[file].judge} file={file} bare />
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
          caption={guideActions.agent.label}
          compact
        />
      </div>
      <a class="action-link" href={guideActions.human.href}>
        {guideActions.human.label} <Icon name="arrow-right" />
      </a>
      <a class="action-link demo-link" href={guideActions.demo.href}>
        {guideActions.demo.label} <Icon name="arrow-right" />
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
      <code>{guideRun.code}</code>
      <CopyButton text={guideRun.code} label="Copy run command" compact />
    </div>
  );
}

function GuidedSteps() {
  const [judge, setJudge] = createSignal<GuideJudge>(guideJudgeFiles[0]);

  const content = (step: GuideStep) => {
    if (step === "Task") return <TaskCode judge={judge()} />;
    if (step === "Judge")
      return <JudgeChoice value={judge()} onChange={setJudge} />;
    if (step === "Run") return <RunCommand />;
    if (step === "Inspect") return <ResultsCard />;
    return <CodeBlock {...guideComparison(comparisonSource)} />;
  };

  return (
    <div class="guide">
      <ol class="guide-steps">
        <For each={guideSteps}>
          {(step, index) => (
            <li id={guideStepId(step)} class="guide-step">
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
