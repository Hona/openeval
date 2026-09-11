import { type VirtualFileMetrics, Virtualizer } from "@pierre/diffs";
export declare const virtualMetrics: Partial<VirtualFileMetrics>;
export declare function acquireVirtualizer(container: HTMLElement): {
    virtualizer: Virtualizer;
    release(): void;
};
