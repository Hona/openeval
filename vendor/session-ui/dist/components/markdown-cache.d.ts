export type MarkdownCacheEntry = {
    raw: string;
    hash: string;
    html: string;
};
export declare function sanitizeMarkdown(html: string): string;
export declare function getCachedMarkdown(key: string): MarkdownCacheEntry;
export declare function touchCachedMarkdown(key: string, value: MarkdownCacheEntry): void;
export declare function preloadMarkdown(text: string, cacheKey: string, signal?: AbortSignal): Promise<void>;
export declare function getReadyMarkdown(block: {
    raw: string;
    src: string;
}, key?: string): MarkdownCacheEntry;
export declare function renderCachedMarkdown(block: {
    raw: string;
    src: string;
}, key?: string, signal?: AbortSignal): Promise<MarkdownCacheEntry>;
