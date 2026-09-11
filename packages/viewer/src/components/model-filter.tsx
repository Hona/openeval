import { createMemo, For, Show } from "solid-js";
import { Button } from "@opencode/ui/button";
import { Checkbox } from "@opencode/ui/checkbox";
import { Icon } from "@opencode/ui/icon";
import { Popover } from "@opencode/ui/popover";
import { matchesModelFilters, modelGroup } from "../model";

export function ModelFilter(props: {
  models: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const groups = createMemo(() =>
    (["lab", "family"] as const).map((kind) => {
      const counts = new Map<string, number>();
      for (const model of props.models) {
        const label = modelGroup(model)[kind];
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      return {
        kind,
        label: kind === "lab" ? "Labs" : "Model families",
        options: [...counts]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([label, count]) => ({ key: `${kind}:${label}`, label, count })),
      };
    }),
  );
  const labels = () =>
    props.selected.map((key) => key.slice(key.indexOf(":") + 1));
  const summary = () =>
    !labels().length
      ? "All models"
      : labels().length === 1
        ? labels()[0]
        : `${labels()[0]} +${labels().length - 1}`;
  const toggle = (key: string, checked: boolean) =>
    props.onChange(
      checked
        ? [...new Set([...props.selected, key])]
        : props.selected.filter((item) => item !== key),
    );
  return (
    <div class="model-filter">
      <Popover
        title="Labs / model families"
        placement="bottom-end"
        class="model-filter-popover"
        triggerAs={Button}
        triggerProps={{
          size: "small",
          variant: "outline",
          "aria-label": `Filter labs and model families: ${labels().join(", ") || "All models"}`,
        }}
        trigger={
          <>
            <span>{summary()}</span>
            <Icon name="chevron-down" />
          </>
        }
      >
        <p class="model-filter-hint">Show models matching any selection.</p>
        <div class="model-filter-groups">
          <For each={groups()}>
            {(group) => (
              <fieldset>
                <legend>{group.label}</legend>
                <For each={group.options}>
                  {(option) => (
                    <div class="model-filter-option">
                      <Checkbox
                        checked={props.selected.includes(option.key)}
                        onChange={(checked) => toggle(option.key, checked)}
                      >
                        {option.label}
                      </Checkbox>
                      <span aria-label={`${option.count} models`}>
                        {option.count}
                      </span>
                    </div>
                  )}
                </For>
              </fieldset>
            )}
          </For>
        </div>
        <div class="model-filter-footer">
          <span>
            {
              props.models.filter((model) =>
                matchesModelFilters(model, props.selected),
              ).length
            }{" "}
            of {props.models.length} models
          </span>
          <Button
            size="small"
            variant="ghost-muted"
            disabled={!props.selected.length}
            onClick={() => props.onChange([])}
          >
            Clear filters
          </Button>
        </div>
      </Popover>
      <Show when={props.selected.length}>
        <Button
          size="small"
          variant="ghost-muted"
          aria-label="Clear model filters"
          onClick={() => props.onChange([])}
        >
          Clear
        </Button>
      </Show>
    </div>
  );
}
