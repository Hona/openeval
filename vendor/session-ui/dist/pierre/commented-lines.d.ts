import { type SelectedLineRange } from "@pierre/diffs";
export type CommentSide = "additions" | "deletions";
export declare function markCommentedDiffLines(root: ShadowRoot, ranges: SelectedLineRange[]): void;
export declare function markCommentedFileLines(root: ShadowRoot, ranges: SelectedLineRange[]): void;
