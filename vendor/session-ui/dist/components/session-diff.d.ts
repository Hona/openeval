import { type FileDiffMetadata } from "@pierre/diffs";
import type { FileDiffInfo } from "@opencode/client/promise";
import type { PresentationFileDiff } from "../file-presentation";
type LegacyDiff = {
    file: string;
    patch?: string;
    before?: string;
    after?: string;
    additions: number;
    deletions: number;
    status?: "added" | "deleted" | "modified";
};
type ReviewDiff = (PresentationFileDiff & {
    file: string;
}) | FileDiffInfo | LegacyDiff;
export type DiffSource = Pick<LegacyDiff, "file" | "patch" | "before" | "after">;
export type ViewDiff = {
    file: string;
    additions: number;
    deletions: number;
    status?: "added" | "deleted" | "modified";
    fileDiff: FileDiffMetadata;
};
export declare function resolveFileDiff(diff: DiffSource): FileDiffMetadata;
export declare function normalize(diff: ReviewDiff): ViewDiff;
export declare function text(diff: ViewDiff, side: "deletions" | "additions"): string;
export declare function completePatchContents(patch: string): {
    before: string;
    after: string;
};
export {};
