import { Dialog } from "@kobalte/core/dialog";
import { IconButton } from "@opencode/ui/icon-button";
import { Icon } from "@opencode/ui/icon";
import type { JSX } from "solid-js";
import { SecretToggle } from "../privacy";

export function SessionDrawer(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: JSX.Element;
}) {
  const opener =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : undefined;
  const runKey = opener?.dataset.runKey;
  return (
    <Dialog
      open={props.open}
      modal
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay class="session-drawer-backdrop" />
        <Dialog.Content
          class="session-drawer"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            queueMicrotask(() => {
              const target = opener?.isConnected
                ? opener
                : [
                    ...document.querySelectorAll<HTMLElement>("[data-run-key]"),
                  ].find((item) => item.dataset.runKey === runKey);
              target?.focus({ preventScroll: true });
            });
          }}
        >
          <Dialog.Title class="sr-only">{props.title}</Dialog.Title>
          <div class="session-drawer-actions">
            <SecretToggle />
            <IconButton
              size="small"
              variant="ghost-muted"
              icon={<Icon name="close" />}
              aria-label="Close eval run"
              onClick={props.onClose}
            />
          </div>
          {props.children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
