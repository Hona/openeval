import type { Block, Projection } from "./markdown-stream";
export declare function completedProjection(text: string): Projection;
export declare function canReusePendingBlock(current: Pick<Block, "mode" | "raw"> | undefined, next: Block): boolean;
