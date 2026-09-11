import type { MarkdownToken } from "./markdown-worker-protocol";
export type RenderedCodeState = {
    language: string;
    generation: number;
    stableCount: number;
    unstable: MarkdownToken[];
    raw: string;
};
export declare function shouldResetCodeTokens(previous: RenderedCodeState | undefined, next: {
    language: string;
    generation: number;
    stableCount: number;
    raw: string;
}): boolean;
