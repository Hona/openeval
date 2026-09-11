import { type SelectedLineRange } from "@pierre/diffs";
import { type Accessor, type JSX } from "solid-js";
import { type LineCommentShape, type LineCommentStateProps } from "../../components/line-comment-annotations";
import { type LineCommentEditorMention } from "@opencode/ui/line-comment";
type LineCommentControllerV2Props<T extends LineCommentShape> = {
    comments: Accessor<T[]>;
    draftKey: Accessor<string>;
    label: string;
    state: LineCommentStateProps<string>;
    getSide: (range: SelectedLineRange) => "additions" | "deletions";
    onSubmit: (input: {
        comment: string;
        selection: SelectedLineRange;
    }) => void;
    onUpdate?: (input: {
        id: string;
        comment: string;
        selection: SelectedLineRange;
    }) => void;
    onDelete?: (comment: T) => void;
    renderCommentActions?: (comment: T, controls: {
        edit: VoidFunction;
        remove: VoidFunction;
    }) => JSX.Element;
    editSubmitLabel?: string;
    mention?: LineCommentEditorMention;
};
export declare function createLineCommentControllerV2<T extends LineCommentShape>(props: LineCommentControllerV2Props<T>): {
    note: {
        draft: () => string;
        setDraft: (value: string) => void;
        editing: () => string;
        opened: Accessor<string>;
        selected: Accessor<SelectedLineRange>;
        commenting: Accessor<SelectedLineRange>;
        isOpen: (id: string) => boolean;
        isEditing: (id: string) => boolean;
        closeComment: () => void;
        openComment: (id: string, range: SelectedLineRange, options?: {
            cancelDraft?: boolean;
        }) => void;
        toggleComment: (id: string, range: SelectedLineRange, options?: {
            cancelDraft?: boolean;
        }) => void;
        openDraft: (range: SelectedLineRange) => void;
        openEditor: (id: string, range: SelectedLineRange, value: string) => void;
        hoverComment: (range: SelectedLineRange) => void;
        cancelDraft: () => void;
        select: (range: SelectedLineRange | null) => SelectedLineRange;
        reset: () => void;
    };
    annotations: Accessor<import("@pierre/diffs").DiffLineAnnotation<import("../../components/line-comment-annotations").LineCommentAnnotationMeta<T>>[]>;
    renderAnnotation: <A extends {
        metadata: import("../../components/line-comment-annotations").LineCommentAnnotationMeta<T>;
    }>(annotation: A) => HTMLDivElement;
    renderGutterUtility: (getHoveredLine: () => {
        lineNumber: number;
        side?: "additions" | "deletions";
    } | undefined) => HTMLButtonElement;
    onLineSelected: (range: SelectedLineRange | null) => void;
    onLineSelectionEnd: (range: SelectedLineRange | null) => void;
    onLineNumberSelectionEnd: (range: SelectedLineRange | null) => void;
};
export {};
