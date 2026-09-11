export declare function createLatestWorkerQueue<T extends {
    key: string;
}>(input: {
    run: (request: T) => Promise<void>;
    supersede: (request: T) => void;
    dispose: (key: string) => void;
}): {
    highlight(request: T): void;
    dispose(key: string): void;
    pending: () => number;
    idle(): Promise<void>;
};
