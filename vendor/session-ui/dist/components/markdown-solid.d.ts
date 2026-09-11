type MarkdownNode = {
    key: string;
    type: "element";
    tag: string;
    attributes: Record<string, string>;
    children: MarkdownNode[];
} | {
    key: string;
    type: "text";
    text: string;
} | {
    key: string;
    type: "word";
    text: string;
    animate?: true;
};
export declare function createMarkdownRenderer(root: HTMLDivElement, html: string, words: boolean): {
    update(next: string, nextWords: boolean, animate?: boolean): void;
    dispose: () => void;
};
export declare function parseMarkdownNodes(html: string, words: boolean, animate?: boolean): MarkdownNode[];
export {};
