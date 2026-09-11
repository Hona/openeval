import type { JSX } from "solid-js";
export declare function DockPrompt(props: {
    kind: "question" | "permission";
    header: JSX.Element;
    children: JSX.Element;
    footer: JSX.Element;
    ref?: (el: HTMLDivElement) => void;
    onKeyDown?: JSX.EventHandlerUnion<HTMLDivElement, KeyboardEvent>;
}): JSX.Element;
