export declare function createWorkerTransport<T extends {
    id: number;
    key: string;
}>(input: {
    post: (request: T) => void;
    supersede: (request: T) => void;
}): {
    send(request: T): void;
    complete(key: string, id: number): void;
    dispose(key: string): void;
    reset(): void;
    queued: () => number;
};
