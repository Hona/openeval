import { type ComponentProps } from "solid-js";
export declare function Markdown(props: ComponentProps<"div"> & {
    text: string;
    cacheKey?: string;
    streaming?: boolean;
    deferUntilReady?: boolean;
    class?: string;
    classList?: Record<string, boolean>;
}): import("solid-js").JSX.Element;
