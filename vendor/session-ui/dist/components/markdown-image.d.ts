import type { ReadMarkdownImage } from "../context/markdown";
export declare function localImagePath(source: string): string;
export declare function createMarkdownImages(read: ReadMarkdownImage): {
    update(root: HTMLElement): void;
    dispose(): void;
};
