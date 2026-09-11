import { Show } from "solid-js";
import { Badge } from "@opencode/ui/badge";
import { Button } from "@opencode/ui/button";
import type { LiveEvalRun, ActivityRun } from "../types";
import { modelName, stateLabel } from "../model";
import { SessionTabs } from "./session-tabs";
import { verdict, type StageKind } from "./activity";

export function LiveEvalRunTrace(props: {
  run: ActivityRun;
  selected: LiveEvalRun;
  stage: StageKind;
  onBack: () => void;
}) {
  const stage = () =>
    props.stage === "judge" ? props.selected.judge : props.selected.eval;
  const label = () =>
    props.stage === "judge" && stage().status === "completed"
      ? `Judge · ${verdict(stage())}`
      : `${props.stage === "judge" ? "Judge" : "Eval run"} · ${stateLabel(stage().status)}`;
  return (
    <section class="live-trace-panel">
      <header class="live-trace-heading">
        <Button
          size="small"
          variant="ghost-muted"
          icon="arrow-left"
          onClick={props.onBack}
        >
          Queue
        </Button>
        <div>
          <h2>{modelName(props.selected.model)}</h2>
          <p>
            {props.run.state.eval} · run {props.selected.repetition} ·{" "}
            {props.selected.reasoning}
          </p>
        </div>
        <Badge>{label()}</Badge>
      </header>
      <Show when={props.selected.attention ?? props.selected.message}>
        <div class="error-banner">
          {props.selected.attention ?? props.selected.message}
        </div>
      </Show>
      <SessionTabs
        benchmarkId={props.run.benchmarkId}
        candidateId={props.selected.evalRunId}
        judgeId={props.selected.judgeRunId}
        state={props.selected}
        initialTab={props.stage === "judge" ? "judge" : "session"}
      />
    </section>
  );
}
