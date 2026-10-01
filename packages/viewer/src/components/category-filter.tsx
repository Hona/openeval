import { For, Show } from "solid-js";
import { Button } from "@opencode/ui/button";
import { Checkbox } from "@opencode/ui/checkbox";
import { Icon } from "@opencode/ui/icon";
import { Popover } from "@opencode/ui/popover";
import type { CategorySummary } from "@hona/openeval/view";

export const LOW_COVERAGE = 3;
export const criteriaCount = (count: number) =>
  `${count} ${count === 1 ? "criterion" : "criteria"}`;

export function CategoryFilter(props: {
  categories: CategorySummary[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const names = () =>
    props.categories
      .filter((category) => props.selected.includes(category.key))
      .map((category) => category.name);
  const summary = () =>
    !names().length
      ? "All categories"
      : names().length === 1
        ? names()[0]
        : `${names()[0]} +${names().length - 1}`;
  const toggle = (key: string, checked: boolean) =>
    props.onChange(
      checked
        ? props.categories
            .map((category) => category.key)
            .filter((item) => item === key || props.selected.includes(item))
        : props.selected.filter((item) => item !== key),
    );
  return (
    <div class="model-filter category-filter">
      <Popover
        title="Categories"
        placement="bottom-end"
        class="model-filter-popover"
        triggerAs={Button}
        triggerProps={{
          size: "small",
          variant: "outline",
          "aria-label": `Filter criteria by category: ${names().join(", ") || "All categories"}`,
        }}
        trigger={
          <>
            <span>{summary()}</span>
            <Icon name="chevron-down" />
          </>
        }
      >
        <p class="model-filter-hint">
          Score only criteria in any selected category.
        </p>
        <fieldset class="category-filter-options">
          <legend>Categories</legend>
          <For each={props.categories}>
            {(category) => (
              <div class="model-filter-option">
                <Checkbox
                  checked={props.selected.includes(category.key)}
                  onChange={(checked) => toggle(category.key, checked)}
                >
                  {category.name}
                </Checkbox>
                <span
                  classList={{ low: category.criteria < LOW_COVERAGE }}
                  aria-label={criteriaCount(category.criteria)}
                  title={
                    category.criteria < LOW_COVERAGE
                      ? "Low coverage: fewer than 3 criteria"
                      : undefined
                  }
                >
                  {category.criteria}
                </span>
              </div>
            )}
          </For>
        </fieldset>
        <div class="model-filter-footer">
          <span>
            {props.selected.length || props.categories.length} of{" "}
            {props.categories.length} categories
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
          aria-label="Clear category filters"
          onClick={() => props.onChange([])}
        >
          Clear
        </Button>
      </Show>
    </div>
  );
}
