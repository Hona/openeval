import type { FileDiffInfo, SessionMessageUser } from "@opencode/client/promise";
import { ComponentProps } from "solid-js";
export declare function MessageNav(props: ComponentProps<"ul"> & {
    messages: SessionMessageUser[];
    current?: SessionMessageUser;
    size: "normal" | "compact";
    onMessageSelect: (message: SessionMessageUser) => void;
    getLabel?: (message: SessionMessageUser) => string | undefined;
    getChanges?: (message: SessionMessageUser) => FileDiffInfo[] | undefined;
}): import("solid-js").JSX.Element;
