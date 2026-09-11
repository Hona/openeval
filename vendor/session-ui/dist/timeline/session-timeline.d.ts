import type { SessionDocument } from "../document";
import type { SessionUserActions } from "../actions";
import { type ReasoningMode } from "./projection";
import { type SessionUserPresentation } from "./session-timeline-row";
export type { SessionUserPresentation } from "./session-timeline-row";
export type SessionTimelineProps = {
    document: SessionDocument;
    presentation?: Record<string, SessionUserPresentation | undefined>;
    actions?: SessionUserActions;
    reasoningMode?: ReasoningMode;
    shellToolDefaultOpen?: boolean;
    editToolDefaultOpen?: boolean;
    class?: string;
};
export declare function SessionTimeline(props: SessionTimelineProps): import("solid-js").JSX.Element;
