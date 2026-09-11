import { Component, type JSX } from "solid-js";
import { type IconProps } from "@opencode/ui/icon";
import type { SessionMessageAssistantReasoning, SessionMessageAssistantTool, SessionMessageShell } from "@opencode/client/promise";
export type ToolInfo = {
    icon: IconProps["name"];
    title: string;
    subtitle?: string;
};
export declare function getToolInfo(tool: string, input?: Record<string, unknown>, metadata?: Record<string, unknown> | undefined): ToolInfo;
export type ContextGroupPart = SessionMessageAssistantTool | (SessionMessageAssistantReasoning & {
    id: string;
    streaming?: boolean;
}) | {
    type: "notice" | "shell";
    id: string;
    render: () => JSX.Element;
};
export declare function CurrentContextToolGroup(props: {
    parts: ContextGroupPart[];
    busy: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSizeChange?: () => void;
    reasoningDefaultOpen?: boolean;
    reasoningOpen?: (id: string) => boolean | undefined;
    onReasoningOpenChange?: (id: string, open: boolean) => void;
    toolDefaultOpen?: (tool: SessionMessageAssistantTool) => boolean | undefined;
    toolOpen?: (id: string) => boolean | undefined;
    onToolOpenChange?: (id: string, open: boolean) => void;
    fileOpen?: (path: string) => boolean | undefined;
    onFileOpenChange?: (path: string, open: boolean) => void;
    patchGroupKey?: (tools: SessionMessageAssistantTool[]) => string;
}): JSX.Element;
export declare function CurrentFileToolGroup(props: {
    tools: SessionMessageAssistantTool[];
    fileOpen?: (path: string) => boolean | undefined;
    onFileOpenChange?: (path: string, open: boolean) => void;
    onSizeChange?: () => void;
}): JSX.Element;
export interface ToolProps {
    input: Record<string, unknown>;
    metadata: Record<string, unknown>;
    tool: string;
    sessionID?: string;
    output?: string;
    status?: string;
    hideDetails?: boolean;
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    fileOpen?: (path: string) => boolean | undefined;
    onFileOpenChange?: (path: string, open: boolean) => void;
    deferContent?: boolean;
    virtualizeDiff?: boolean;
    onContentRendered?: () => void;
    forceOpen?: boolean;
    locked?: boolean;
}
export type ToolComponent = Component<ToolProps>;
export declare function registerTool(input: {
    name: string;
    render?: ToolComponent;
}): {
    name: string;
    render?: ToolComponent;
};
export declare function getTool(name: string): ToolComponent;
export declare const ToolRegistry: {
    register: typeof registerTool;
    render: typeof getTool;
};
export declare function ToolDisplay(props: ToolProps & {
    id: string;
    error?: string;
}): JSX.Element;
export declare function SessionShellMessage(props: {
    message: SessionMessageShell;
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}): JSX.Element;
