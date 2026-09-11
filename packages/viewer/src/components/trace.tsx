import { Show } from "solid-js";
import { Button } from "@opencode/ui/button";
import { Badge } from "@opencode/ui/badge";
import { Select } from "@opencode/ui/select";
import type { EvalRunIndex, EvalRunSummary } from "../types";
import { duration, formatCost, modelName } from "../model";
import { SessionTabs } from "./session-tabs";

export function EvalRunTrace(props: {
  run: EvalRunIndex;
  selected: EvalRunSummary;
  onRun: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <section class="trace-view">
      <div class="trace-heading">
        <div>
          <Button
            size="small"
            variant="ghost-muted"
            icon="arrow-left"
            onClick={props.onBack}
          >
            Eval results
          </Button>
          <h1>{modelName(props.selected.model)}</h1>
          <p>
            {props.run.eval}
            <span>·</span>
            {props.selected.reasoning}
            <span>·</span>
            {duration(props.selected.elapsedMs)}
            <span>·</span>Cost {formatCost(props.selected.cost.usd)}
          </p>
        </div>
        <div class="trace-actions">
          <Badge>{props.selected.status}</Badge>
          <Show when={props.run.runs.length > 1}>
            <Select
              aria-label="Eval run"
              options={props.run.runs}
              current={props.selected}
              value={(run) => run.id}
              label={(run) =>
                `${modelName(run.model)} · ${run.reasoning} · run ${run.repetition}`
              }
              onSelect={(run) => {
                if (run) props.onRun(run.id);
              }}
            />
          </Show>
        </div>
      </div>
      <Show when={props.selected.message}>
        <div class="error-banner">{props.selected.message}</div>
      </Show>
      <SessionTabs
        benchmarkId={props.run.benchmarkId}
        candidateId={props.selected.evalRunId}
        judgeId={props.selected.judgeRunId}
        state={props.selected}
      />
    </section>
  );
}
