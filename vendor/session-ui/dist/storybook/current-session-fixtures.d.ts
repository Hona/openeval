import type { SessionMessageAssistant, SessionMessageInfo, SessionMessageUser, SessionStatus } from "@opencode/client/promise";
import type { SessionDocument } from "../document";
export declare const CURRENT_SESSION_ID = "session_current_story";
export declare const STORY_TIME = 1735689600000;
export declare const STORY_MODEL: {
    id: string;
    providerID: string;
    variant: string;
};
export declare const emptySessionDocument: {
    sessionID: string;
    messages: any[];
    status: {
        type: "idle";
    };
    diffs: any[];
};
export declare const pendingAndQueuedDocument: SessionDocument;
export declare const queuedPrompts: {
    id: string;
    text: string;
}[];
export declare const streamingDocument: SessionDocument;
export declare const reviewDiffs: ({
    file: string;
    patch: string;
    additions: number;
    deletions: number;
    status: "modified";
} | {
    file: string;
    patch: string;
    additions: number;
    deletions: number;
    status: "added";
})[];
export declare const editThenTestDocument: {
    diffs: ({
        file: string;
        patch: string;
        additions: number;
        deletions: number;
        status: "modified";
    } | {
        file: string;
        patch: string;
        additions: number;
        deletions: number;
        status: "added";
    })[];
    sessionID: string;
    messages: SessionMessageInfo[];
    status: SessionStatus;
};
export declare const standaloneShellRunningDocument: SessionDocument;
export declare const standaloneShellCompletedDocument: SessionDocument;
export declare const thinkingDocument: SessionDocument;
export declare const fileChangeLoadingDocument: SessionDocument;
export declare const fileChangeRunningDocument: SessionDocument;
export declare const multiFilePatchDocument: SessionDocument;
export declare const writeFileDocument: SessionDocument;
export declare const terminalRunningDocument: SessionDocument;
export declare const terminalPassedDocument: SessionDocument;
export declare const expandedShellDocument: SessionDocument;
export declare const executeCodeDocument: SessionDocument;
export declare const terminalFailedDocument: SessionDocument;
export declare const recoveryDocument: SessionDocument;
export declare const requestHistoryDocument: SessionDocument;
export declare const inspectAndExplainDocument: SessionDocument;
export declare const webResearchDocument: SessionDocument;
export declare const loadedResourcesDocument: SessionDocument;
export declare const instructionsUpdatedSingleDocument: SessionDocument;
export declare const instructionsUpdatedMultipleDocument: SessionDocument;
export declare const permissionPendingDocument: SessionDocument;
export declare const questionPendingDocument: SessionDocument;
export declare const activeQuestionRequest: {
    id: string;
    sessionID: string;
    title: string;
    metadata: {
        kind: string;
    };
    fields: [{
        key: string;
        type: "string";
        title: string;
        description: string;
        options: {
            value: string;
            label: string;
            description: string;
        }[];
        custom: true;
    }, {
        key: string;
        type: "multiselect";
        title: string;
        description: string;
        options: {
            value: string;
            label: string;
        }[];
    }];
};
export declare const retryDocument: SessionDocument;
export declare const compactionRunningDocument: SessionDocument;
export declare const compactionDocument: SessionDocument;
export declare const compactionFailedDocument: SessionDocument;
export declare const compactionCancelledDocument: SessionDocument;
export declare const subagentDocument: SessionDocument;
export declare const attachmentsAndCommentsDocument: SessionDocument;
export declare const attachmentsAndCommentsPresentation: {
    msg_user_attachments: {
        comments: {
            path: string;
            comment: string;
            selection: {
                startLine: number;
                endLine: number;
            };
        }[];
    };
};
export declare const revertDocument: SessionDocument;
export declare const largeCompletedDocument: {
    sessionID: string;
    messages: (SessionMessageAssistant | SessionMessageUser)[];
    status: {
        type: "idle";
    };
    diffs: {
        file: string;
        patch: string;
        additions: number;
        deletions: number;
        status: "added";
    }[];
};
export declare const activePermissionRequest: {
    id: string;
    sessionID: string;
    action: string;
    resources: string[];
    save: string[];
    source: {
        type: "tool";
        messageID: string;
        id: string;
    };
};
