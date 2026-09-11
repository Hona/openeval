import { type ParentProps } from "solid-js";
export type ReadMarkdownImage = (path: string, signal: AbortSignal) => Promise<Blob | undefined>;
export declare function MarkdownProvider(props: ParentProps<{
    readImage: ReadMarkdownImage;
}>): import("solid-js").JSX.Element;
export declare const useMarkdown: () => {
    readonly readImage: ReadMarkdownImage;
};
