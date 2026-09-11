import type { SessionMessageAssistant, SessionMessageAssistantTool, SessionMessageUser } from "@opencode/client/promise";
import { type ComponentProps } from "solid-js";
import type { SessionUserActions, SessionUserComment } from "../actions";
import { CurrentContextToolGroup } from "../tools/tool-renderer";
export type { SessionUserActions, SessionUserComment } from "../actions";
export { SessionShellMessage } from "../tools/tool-renderer";
export { currentContentDefaultOpen } from "./current-tool-state";
export declare function SessionUserMessage(props: {
    sessionID: string;
    message: SessionMessageUser;
    displayText?: string;
    comments?: SessionUserComment[];
    historicalAgent: string;
    historicalModel: SessionMessageAssistant["model"];
    actions?: SessionUserActions;
}): import("solid-js").JSX.Element;
export declare function SessionAssistantContent(props: {
    message: SessionMessageAssistant;
    content: SessionMessageAssistant["content"][number];
    contentID: string;
    showAssistantCopyPartID?: string | null;
    turnDurationMs?: number | null;
    defaultOpen?: boolean;
    reasoningDefaultOpen?: boolean;
    toolOpen?: boolean;
    onToolOpenChange?: (open: boolean) => void;
    onContentRendered?: () => void;
}): import("solid-js").JSX.Element;
export declare function SessionContextToolGroup(props: ComponentProps<typeof CurrentContextToolGroup>): import("solid-js").JSX.Element;
export declare function SessionFileToolGroup(props: {
    tools: SessionMessageAssistantTool[];
    fileOpen: (path: string) => boolean | undefined;
    onFileOpenChange: (path: string, open: boolean) => void;
    onSizeChange?: () => void;
}): import("solid-js").JSX.Element;
