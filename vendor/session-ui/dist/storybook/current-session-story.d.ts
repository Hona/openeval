import type { SessionDocument } from "../document";
import type { SessionUserPresentation } from "../timeline/session-timeline";
import { type JSX } from "solid-js";
export declare function CurrentSessionProviders(props: {
    document: SessionDocument;
    children: JSX.Element;
}): JSX.Element;
export declare function CurrentSessionTimelineStory(props: {
    title: string;
    description: string;
    document: SessionDocument;
    presentation?: Record<string, SessionUserPresentation | undefined>;
    width?: string;
    shellToolDefaultOpen?: boolean;
    editToolDefaultOpen?: boolean;
}): JSX.Element;
