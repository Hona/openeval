import { type SelectedLineRange } from "@pierre/diffs";
export declare function findElement(node: Node | null): HTMLElement | undefined;
export declare function findFileLineNumber(node: Node | null): number | undefined;
export declare function findDiffLineNumber(node: Node | null): number | undefined;
export declare function findCodeSelectionSide(node: Node | null): SelectedLineRange["side"];
export declare function readShadowLineSelection(opts: {
    root: ShadowRoot;
    lineForNode: (node: Node | null) => number | undefined;
    sideForNode?: (node: Node | null) => SelectedLineRange["side"];
    preserveTextSelection?: boolean;
}): {
    range: SelectedLineRange;
    text: Range;
};
