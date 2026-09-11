type ReadyWatcher = {
    observer?: MutationObserver;
    token: number;
};
export declare function createReadyWatcher(): ReadyWatcher;
export declare function clearReadyWatcher(state: ReadyWatcher): void;
export declare function getViewerHost(container: HTMLElement | undefined): HTMLElement;
export declare function getViewerRoot(container: HTMLElement | undefined): ShadowRoot;
export declare function applyViewerScheme(host: HTMLElement | undefined): void;
export declare function observeViewerScheme(getHost: () => HTMLElement | undefined): () => void;
export declare function notifyShadowReady(opts: {
    state: ReadyWatcher;
    container: HTMLElement;
    getRoot: () => ShadowRoot | undefined;
    isReady: (root: ShadowRoot) => boolean;
    onReady: () => void;
    settleFrames?: number;
}): void;
export {};
