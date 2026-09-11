import { type MarkdownWorkerState } from "./markdown-worker-protocol";
import type { Projection } from "./markdown-stream";
export declare function parseMarkdown(text: string, signal: AbortSignal): Promise<string>;
export declare function projectMarkdown(key: string, text: string, live: boolean): Promise<Projection>;
export declare function disposeMarkdownProjection(key: string): void;
export declare function highlightStreamingCode(key: string, text: string, language: string, complete?: boolean): Promise<MarkdownWorkerState>;
export declare function disposeStreamingCode(key: string): void;
export declare class MarkdownWorkerDisposedError extends Error {
}
export declare class MarkdownWorkerSupersededError extends Error {
}
export declare class MarkdownWorkerUnavailableError extends Error {
}
