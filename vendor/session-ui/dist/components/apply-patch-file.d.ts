import type { FileDiffInfo } from "@opencode/client/promise";
import { type ViewDiff } from "./session-diff";
type Kind = "add" | "update" | "delete";
export type ApplyPatchFile = {
    path: string;
    type: Kind;
    additions: number;
    deletions: number;
    view: ViewDiff;
    contents?: {
        before: string;
        after: string;
    };
};
export type ApplyPatchFileGroup = Omit<ApplyPatchFile, "view" | "contents"> & {
    views: ViewDiff[];
};
export declare function changedFileDiff(value: unknown): value is FileDiffInfo;
export declare function patchFile(value: unknown): ApplyPatchFile | undefined;
export declare function patchFiles(value: unknown): ApplyPatchFile[];
export declare function patchFileGroups(value: unknown): ApplyPatchFileGroup[];
export {};
