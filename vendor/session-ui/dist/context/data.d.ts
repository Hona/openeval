import type { FileDiffInfo, SessionInfo, SessionStatus, ShellOutputInput, ShellOutputOutput } from "@opencode/client/promise";
import { PreloadMultiFileDiffResult } from "@pierre/diffs/ssr";
export type SessionSummary = Pick<SessionInfo, "id" | "parentID" | "title" | "time">;
type ProviderCatalog = {
    all: Map<string, {
        models: Record<string, {
            name: string;
        }>;
    }>;
    default: {
        [key: string]: string;
    };
    connected: Array<string>;
};
type Data = {
    agent?: {
        name: string;
        color?: string;
    }[];
    provider?: ProviderCatalog;
    session: SessionSummary[];
    session_status: {
        [sessionID: string]: SessionStatus;
    };
    session_diff: {
        [sessionID: string]: FileDiffInfo[];
    };
    session_diff_preload?: {
        [sessionID: string]: PreloadMultiFileDiffResult<unknown>[];
    };
};
export type NavigateToSessionFn = (sessionID: string) => void;
export type SessionHrefFn = (sessionID: string) => string;
export declare const useData: () => {
    readonly store: Data;
    readonly directory: string;
    readonly sessionID: string;
    navigateToSession: NavigateToSessionFn;
    sessionHref: SessionHrefFn;
    shellRunning: (id: string) => boolean;
    shellOutput: (input: ShellOutputInput) => Promise<ShellOutputOutput>;
}, DataProvider: (props: import("solid-js").ParentProps<{
    data: Data;
    directory: string;
    sessionID?: string;
    shellRunning?: (id: string) => boolean;
    shellOutput?: (input: ShellOutputInput) => Promise<ShellOutputOutput>;
    onNavigateToSession?: NavigateToSessionFn;
    onSessionHref?: SessionHrefFn;
}>) => import("solid-js").JSX.Element;
export {};
