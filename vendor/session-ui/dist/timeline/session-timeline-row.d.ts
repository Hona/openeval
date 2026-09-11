import type { SessionMessageUser, SessionStatus } from "@opencode/client/promise";
import { type Accessor, type JSX } from "solid-js";
import type { SessionUserActions, SessionUserComment } from "../actions";
import { type TimelineDetail } from "./detail";
import { createReactiveTimelineProjection, TimelineRow, type ReasoningMode } from "./projection";
type Projection = ReturnType<typeof createReactiveTimelineProjection>;
export type SessionUserPresentation = {
    displayText?: string;
    comments?: SessionUserComment[];
};
export declare function createSessionTimelineRowRenderer(input: {
    sessionID: Accessor<string>;
    status: Accessor<SessionStatus>;
    projection: Projection;
    presentation: (message: SessionMessageUser) => SessionUserPresentation | undefined;
    actions?: SessionUserActions;
    reasoningMode: Accessor<ReasoningMode>;
    shellToolDefaultOpen: Accessor<boolean>;
    editToolDefaultOpen: Accessor<boolean>;
    timelineDetail?: Accessor<TimelineDetail>;
    disclosure: {
        value: (key: string) => boolean | undefined;
        set: (key: string, open: boolean) => void;
        patchGroupKeys?: Map<string, string>;
    };
    centered?: Accessor<boolean>;
    padding?: Accessor<string>;
    anchor?: (messageID: string) => string | undefined;
}): {
    Row: (props: {
        row: Accessor<TimelineRow.TimelineRow>;
        onSizeChange?: () => void;
    }) => JSX.Element;
};
export {};
