import { type JSX } from "solid-js";
export type LineCommentVariant = "default" | "editor";
export type LineCommentAnchorProps = {
    id?: string;
    top?: number;
    inline?: boolean;
    hideButton?: boolean;
    open: boolean;
    variant?: LineCommentVariant;
    icon?: "comment" | "plus";
    buttonLabel?: string;
    onClick?: (event: MouseEvent) => void;
    onMouseEnter?: (event: MouseEvent) => void;
    onPopoverFocusOut?: (event: FocusEvent) => void;
    class?: string;
    popoverClass?: string;
    children?: JSX.Element;
};
export declare const LineCommentAnchor: (props: LineCommentAnchorProps) => JSX.Element;
export type LineCommentProps = Omit<LineCommentAnchorProps, "children" | "variant"> & {
    comment: JSX.Element;
    selection: JSX.Element;
    actions?: JSX.Element;
};
export declare const LineComment: (props: LineCommentProps) => JSX.Element;
export type LineCommentEditorProps = Omit<LineCommentAnchorProps, "children" | "open" | "variant" | "onClick"> & {
    value: string;
    selection: JSX.Element;
    onInput: (value: string) => void;
    onCancel: VoidFunction;
    onSubmit: (value: string) => void;
    placeholder?: string;
    rows?: number;
    autofocus?: boolean;
    cancelLabel?: string;
    submitLabel?: string;
    mention?: {
        items: (query: string) => string[] | Promise<string[]>;
    };
};
export declare const LineCommentEditor: (props: LineCommentEditorProps) => JSX.Element;
