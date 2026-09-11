import { type DiffLineAnnotation, type SelectedLineRange } from "@pierre/diffs";
import { type Accessor, type JSX } from "solid-js";
import { type LineCommentEditorProps } from "./line-comment";
export type LineCommentAnnotationMeta<T> = {
    kind: "comment";
    key: string;
    comment: T;
} | {
    kind: "draft";
    key: string;
    range: SelectedLineRange;
};
export type LineCommentAnnotation<T> = {
    lineNumber: number;
    side?: "additions" | "deletions";
    metadata: LineCommentAnnotationMeta<T>;
};
type LineCommentAnnotationsProps<T> = {
    comments: Accessor<T[]>;
    getCommentId: (comment: T) => string;
    getCommentSelection: (comment: T) => SelectedLineRange;
    draftRange: Accessor<SelectedLineRange | null>;
    draftKey: Accessor<string>;
};
type LineCommentAnnotationsWithSideProps<T> = LineCommentAnnotationsProps<T> & {
    getSide: (range: SelectedLineRange) => "additions" | "deletions";
};
type HoverCommentLine = {
    lineNumber: number;
    side?: "additions" | "deletions";
};
export type LineCommentStateProps<T> = {
    opened: Accessor<T | null>;
    setOpened: (id: T | null) => void;
    selected: Accessor<SelectedLineRange | null>;
    setSelected: (range: SelectedLineRange | null) => void;
    commenting: Accessor<SelectedLineRange | null>;
    setCommenting: (range: SelectedLineRange | null) => void;
    syncSelected?: (range: SelectedLineRange | null) => void;
    hoverSelected?: (range: SelectedLineRange) => void;
};
export type LineCommentShape = {
    id: string;
    selection: SelectedLineRange;
    comment: string;
};
type LineCommentControllerProps<T extends LineCommentShape> = {
    comments: Accessor<T[]>;
    draftKey: Accessor<string>;
    label: string;
    mention?: LineCommentEditorProps["mention"];
    state: LineCommentStateProps<string>;
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
    onDraftPopoverFocusOut?: (event: FocusEvent) => void;
    getHoverSelectedRange?: Accessor<SelectedLineRange | null>;
    cancelDraftOnCommentToggle?: boolean;
    clearSelectionOnSelectionEndNull?: boolean;
};
type LineCommentControllerWithSideProps<T extends LineCommentShape> = LineCommentControllerProps<T> & {
    getSide: (range: SelectedLineRange) => "additions" | "deletions";
};
type CommentProps = {
    id?: string;
    open: boolean;
    comment: JSX.Element;
    selection: JSX.Element;
    actions?: JSX.Element;
    editor?: DraftProps;
    onClick?: (event: MouseEvent) => void;
    onMouseEnter?: (event: MouseEvent) => void;
};
type DraftProps = {
    value: string;
    selection: JSX.Element;
    mention?: LineCommentEditorProps["mention"];
    onInput: (value: string) => void;
    onCancel: VoidFunction;
    onSubmit: (value: string) => void;
    onPopoverFocusOut?: (event: FocusEvent) => void;
    cancelLabel?: string;
    submitLabel?: string;
};
export declare function createLineCommentAnnotationRenderer<T, C, D>(props: {
    renderComment: (comment: T) => C;
    renderDraft: (range: SelectedLineRange) => D;
    commentElement: (view: Accessor<C>) => JSX.Element;
    draftElement: (view: Accessor<D>) => JSX.Element;
}): {
    render: <A extends {
        metadata: LineCommentAnnotationMeta<T>;
    }>(annotation: A) => HTMLDivElement;
    reconcile: <A extends {
        metadata: LineCommentAnnotationMeta<T>;
    }>(annotations: A[]) => void;
    cleanup: () => void;
};
export declare function createLineCommentState<T>(props: LineCommentStateProps<T>): {
    draft: () => string;
    setDraft: (value: string) => void;
    editing: () => T;
    opened: Accessor<T>;
    selected: Accessor<SelectedLineRange>;
    commenting: Accessor<SelectedLineRange>;
    isOpen: (id: T) => boolean;
    isEditing: (id: T) => boolean;
    closeComment: () => void;
    openComment: (id: T, range: SelectedLineRange, options?: {
        cancelDraft?: boolean;
    }) => void;
    toggleComment: (id: T, range: SelectedLineRange, options?: {
        cancelDraft?: boolean;
    }) => void;
    openDraft: (range: SelectedLineRange) => void;
    openEditor: (id: T, range: SelectedLineRange, value: string) => void;
    hoverComment: (range: SelectedLineRange) => void;
    cancelDraft: () => void;
    select: (range: SelectedLineRange | null) => SelectedLineRange;
    reset: () => void;
};
export declare function createLineCommentController<T extends LineCommentShape>(props: LineCommentControllerWithSideProps<T>): {
    note: ReturnType<typeof createLineCommentState<string>>;
    annotations: Accessor<DiffLineAnnotation<LineCommentAnnotationMeta<T>>[]>;
    renderAnnotation: ReturnType<typeof createManagedLineCommentAnnotationRenderer<T, CommentProps, DraftProps>>["renderAnnotation"];
    renderGutterUtility: ReturnType<typeof createLineCommentGutterRenderer>;
    onLineSelected: (range: SelectedLineRange | null) => void;
    onLineSelectionEnd: (range: SelectedLineRange | null) => void;
};
export declare function createLineCommentController<T extends LineCommentShape>(props: LineCommentControllerProps<T>): {
    note: ReturnType<typeof createLineCommentState<string>>;
    annotations: Accessor<LineCommentAnnotation<T>[]>;
    renderAnnotation: ReturnType<typeof createManagedLineCommentAnnotationRenderer<T, CommentProps, DraftProps>>["renderAnnotation"];
    renderGutterUtility: ReturnType<typeof createLineCommentGutterRenderer>;
    onLineSelected: (range: SelectedLineRange | null) => void;
    onLineSelectionEnd: (range: SelectedLineRange | null) => void;
};
export declare function createLineCommentAnnotations<T>(props: LineCommentAnnotationsWithSideProps<T>): Accessor<DiffLineAnnotation<LineCommentAnnotationMeta<T>>[]>;
export declare function createLineCommentAnnotations<T>(props: LineCommentAnnotationsProps<T>): Accessor<LineCommentAnnotation<T>[]>;
export declare function createManagedLineCommentAnnotationRenderer<T, C, D>(props: {
    annotations: Accessor<LineCommentAnnotation<T>[]>;
    renderComment: (comment: T) => C;
    renderDraft: (range: SelectedLineRange) => D;
    commentElement: (view: Accessor<C>) => JSX.Element;
    draftElement: (view: Accessor<D>) => JSX.Element;
}): {
    renderAnnotation: <A extends {
        metadata: LineCommentAnnotationMeta<T>;
    }>(annotation: A) => HTMLDivElement;
};
export declare function createLineCommentGutterRenderer(props: {
    label: string;
    getSelectedRange: Accessor<SelectedLineRange | null>;
    onOpenDraft: (range: SelectedLineRange) => void;
}): (getHoveredLine: () => HoverCommentLine | undefined) => HTMLButtonElement;
export {};
