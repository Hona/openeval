import type { JsonValue, SessionMessageAssistant, SessionMessageAssistantTool } from "@opencode/client/promise";
import type { SessionDocument } from "../document";
export declare function storyTool(id: string, name: string, status: "streaming" | "running" | "completed" | "error", input: Record<string, JsonValue>, options?: {
    metadata?: Record<string, JsonValue>;
    output?: string;
    error?: string;
    raw?: string;
}): SessionMessageAssistantTool;
export declare function storyDocument(content: SessionMessageAssistant["content"], busy?: boolean): SessionDocument;
export declare function storyPatchFile(file: string, status?: "modified" | "added"): {
    file: string;
    status: "modified" | "added";
    patch: string;
    additions: number;
    deletions: number;
};
