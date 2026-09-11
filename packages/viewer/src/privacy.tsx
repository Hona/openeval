import { createSignal } from "solid-js";
import { IconButton } from "@opencode/ui/icon-button";
import { Icon } from "@opencode/ui/icon";
import { Tooltip } from "@opencode/ui/tooltip";

export const SECRET_MODE_KEY = "openeval.top-secret";
const saved = () => {
  try {
    return localStorage.getItem(SECRET_MODE_KEY) === "true";
  } catch {
    return false;
  }
};
export const [topSecret, setTopSecret] = createSignal(saved());

export function SecretToggle() {
  return (
    <Tooltip
      value={
        topSecret()
          ? "Click to show eval names and enable traces"
          : "Click to blur eval names and disable traces"
      }
    >
      <IconButton
        size="small"
        variant="ghost"
        icon={<Icon name="glasses" />}
        class="secret-toggle"
        aria-label="Top secret"
        aria-pressed={topSecret()}
        onClick={() => setTopSecret(!topSecret())}
      />
    </Tooltip>
  );
}

export function EvalName(props: { children: string; sensitive?: boolean }) {
  return (
    <span
      class="eval-name"
      classList={{ "is-secret": topSecret() && props.sensitive !== false }}
      aria-hidden={topSecret() && props.sensitive !== false ? true : undefined}
    >
      {props.children}
    </span>
  );
}
