export declare function CommentCard(props: {
    comment: string;
    path: string;
    selection?: {
        startLine: number;
        endLine: number;
    };
    active?: boolean;
    title?: string;
    tooltip?: boolean;
    wide?: boolean;
    onClick?: () => void;
}): import("solid-js").JSX.Element;
