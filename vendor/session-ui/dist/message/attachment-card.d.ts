import type { JSX } from "solid-js";
import "./attachment-card.css";
/** Shared 160px two-line card used by file and comment attachments. */
export declare function AttachmentCard(props: {
    title: string;
    active?: boolean;
    clickable?: boolean;
    wide?: boolean;
    surface?: "base";
    /** native title attribute */
    hover?: string;
    titleRef?: (element: HTMLSpanElement) => void;
    onClick?: () => void;
    children: JSX.Element;
}): JSX.Element;
