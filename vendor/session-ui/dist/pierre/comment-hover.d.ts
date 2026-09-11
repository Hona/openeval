export type HoverCommentLine = {
    lineNumber: number;
    side?: "additions" | "deletions";
};
export declare function createHoverCommentUtility(props: {
    label: string;
    getHoveredLine: () => HoverCommentLine | undefined;
    onSelect: (line: HoverCommentLine) => void;
}): HTMLButtonElement;
