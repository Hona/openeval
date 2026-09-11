import { WorkerPoolManager } from "@pierre/diffs/worker";
export declare function workerFactory(): Worker;
export declare function getWorkerPool(lineDiffType?: "none" | "word-alt"): WorkerPoolManager | undefined;
export declare function getWorkerPools(): {
    unified: WorkerPoolManager;
    split: WorkerPoolManager;
};
