import { type JSX } from "solid-js";
import type { SessionMessageAssistant, SessionMessageAssistantReasoning, SessionMessageCompaction, SessionMessageUser } from "@opencode/client/promise";
import type { SessionUserActions, SessionUserComment } from "../actions";
export declare function writeClipboard(text: string): Promise<boolean>;
export declare function CurrentUserMessageDisplay(props: {
    sessionID: string;
    message: SessionMessageUser;
    text: string;
    agent: string;
    model: SessionMessageAssistant["model"];
    actions?: SessionUserActions;
    comments?: SessionUserComment[];
}): JSX.Element;
export declare function SessionCompactionMessage(props: {
    message: SessionMessageCompaction;
    error: string;
}): JSX.Element;
export declare function AssistantTextContent(props: {
    id: string;
    text: string;
    message: SessionMessageAssistant;
    showCopy: boolean;
    turnDurationMs?: number | null;
}): JSX.Element;
export declare function AssistantReasoningContent(props: {
    id: string;
    content: SessionMessageAssistantReasoning;
    streaming: boolean;
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onContentRendered?: () => void;
}): JSX.Element;
