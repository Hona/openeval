import type { ModelRef, SessionMessageAssistant, SessionMessageInfo, SessionMessageUser, SessionStatus } from "@opencode/client/promise";
import { type Accessor } from "solid-js";
import { TimelineRow, type PartGroup, type PartRef, type TimelineRowMap } from "./timeline-row";
import { type TimelineDetail } from "./detail";
export { TimelineRow, type PartGroup, type PartRef, type TimelineRowMap };
export type ReasoningMode = "hidden" | "compact" | "full";
type Notice = Exclude<SessionMessageInfo, {
    type: "user" | "assistant" | "shell";
}>;
type Entry = {
    type: "assistant";
    message: SessionMessageAssistant;
} | {
    type: "notice";
    message: Notice;
};
type Content = SessionMessageAssistant["content"][number];
export type TimelineProjectionInput = {
    sessionMessages: SessionMessageInfo[];
    status: SessionStatus;
    reasoningMode: ReasoningMode;
    shellToolDefaultOpen?: boolean;
    editToolDefaultOpen?: boolean;
    timelineDetail?: TimelineDetail;
    pendingUserMessageIDs?: ReadonlySet<string>;
    previousRows?: TimelineRow.TimelineRow[];
};
export declare function createTimelineProjection(input: TimelineProjectionInput): {
    activeMessageID: string;
    assistantMessagesByParent: Map<string, SessionMessageAssistant[]>;
    lastAssistantGroupKey: Map<string, string>;
    messageByID: Map<string, SessionMessageInfo>;
    messageRowIndex: Map<string, number>;
    messageLastRowIndex: Map<string, number>;
    rowByKey: Map<string, TimelineRow.TimelineRow>;
    rows: TimelineRow.TimelineRow[];
    sessionMessageByID: Map<string, SessionMessageInfo>;
    userContextByID: Map<string, {
        agent: string;
        model: ModelRef;
    }>;
};
export declare function createReactiveTimelineProjection(input: {
    sessionMessages: Accessor<SessionMessageInfo[]>;
    status: Accessor<SessionStatus>;
    reasoningMode: Accessor<ReasoningMode>;
    shellToolDefaultOpen?: Accessor<boolean>;
    editToolDefaultOpen?: Accessor<boolean>;
    timelineDetail?: Accessor<TimelineDetail>;
    pendingUserMessageIDs?: Accessor<ReadonlySet<string>>;
}): {
    activeMessageID: Accessor<string>;
    assistantMessagesByParent: Accessor<Map<string, SessionMessageAssistant[]>>;
    lastAssistantGroupKey: Accessor<Map<string, string>>;
    messageByID: Accessor<Map<string, SessionMessageInfo>>;
    messageRowIndex: Accessor<Map<string, number>>;
    messageLastRowIndex: Accessor<Map<string, number>>;
    rowByKey: Accessor<Map<string, TimelineRow.TimelineRow>>;
    rows: Accessor<TimelineRow.TimelineRow[]>;
    sessionMessageByID: Accessor<Map<string, SessionMessageInfo>>;
    userContextByID: Accessor<Map<string, {
        agent: string;
        model: ModelRef;
    }>>;
};
export declare namespace Timeline {
    function constructSessionMessageRows(messages: SessionMessageInfo[], showReasoning: boolean, status: SessionStatus, pendingUserMessageIDs?: ReadonlySet<string>, shellToolDefaultOpen?: boolean, editToolDefaultOpen?: boolean, isRenderable?: typeof renderable, detail?: TimelineDetail): {
        activeMessageID: string;
        rows: TimelineRow.TimelineRow[];
    };
    function constructMessageRows(userMessage: SessionMessageUser | undefined, turnID: string, entries: Entry[], index: number, showReasoning: boolean, status: SessionStatus, isActive: boolean, shellToolDefaultOpen?: boolean, editToolDefaultOpen?: boolean, isRenderable?: typeof renderable, detail?: TimelineDetail): TimelineRow.TimelineRow[];
    function resolveContent(message: SessionMessageInfo | undefined, partID: string): Content | undefined;
    function contentEntries(message: SessionMessageAssistant): {
        id: string;
        content: import("@opencode/client/promise").SessionMessageAssistantTool | import("@opencode/client/promise").SessionMessageAssistantText | import("@opencode/client/promise").SessionMessageAssistantReasoning;
    }[];
}
export declare function reuseTimelineRows(previous: TimelineRow.TimelineRow[] | undefined, rows: TimelineRow.TimelineRow[]): TimelineRow.TimelineRow[];
declare function renderable(content: Content, showReasoning: boolean, detail?: TimelineDetail): boolean;
export declare function reasoningHeading(text: string): string | undefined;
export declare function unwrapErrorMessage(message: string): string;
