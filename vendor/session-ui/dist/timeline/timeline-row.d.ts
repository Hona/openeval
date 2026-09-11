export type PartRef = {
    messageID: string;
    partID: string;
};
export type PartGroup = {
    key: string;
    type: "part";
    ref: PartRef;
} | {
    key: string;
    type: "context";
    refs: PartRef[];
} | {
    key: string;
    type: "file";
    refs: PartRef[];
};
export declare namespace TimelineRow {
    const TurnGap_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => Readonly<A> & {
        readonly _tag: "TurnGap";
    } & import("effect/Pipeable").Pipeable;
    export class TurnGap extends TurnGap_base<{
        userMessageID: string;
    }> {
    }
    const UserMessage_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => Readonly<A> & {
        readonly _tag: "UserMessage";
    } & import("effect/Pipeable").Pipeable;
    export class UserMessage extends UserMessage_base<{
        userMessageID: string;
    }> {
    }
    const Shell_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => Readonly<A> & {
        readonly _tag: "Shell";
    } & import("effect/Pipeable").Pipeable;
    export class Shell extends Shell_base<{
        userMessageID: string;
        messageID: string;
    }> {
    }
    const Notice_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => Readonly<A> & {
        readonly _tag: "Notice";
    } & import("effect/Pipeable").Pipeable;
    export class Notice extends Notice_base<{
        userMessageID: string;
        messageID: string;
    }> {
    }
    const TurnDivider_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => Readonly<A> & {
        readonly _tag: "TurnDivider";
    } & import("effect/Pipeable").Pipeable;
    export class TurnDivider extends TurnDivider_base<{
        userMessageID: string;
    }> {
    }
    const AssistantPart_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => Readonly<A> & {
        readonly _tag: "AssistantPart";
    } & import("effect/Pipeable").Pipeable;
    export class AssistantPart extends AssistantPart_base<{
        userMessageID: string;
        group: PartGroup;
        previousAssistantPart: boolean;
        spacing?: "tool" | "content";
    }> {
    }
    const Thinking_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => Readonly<A> & {
        readonly _tag: "Thinking";
    } & import("effect/Pipeable").Pipeable;
    export class Thinking extends Thinking_base<{
        userMessageID: string;
        ref: PartRef;
    }> {
    }
    const Error_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => Readonly<A> & {
        readonly _tag: "Error";
    } & import("effect/Pipeable").Pipeable;
    export class Error extends Error_base<{
        userMessageID: string;
        text: string;
    }> {
    }
    const Retry_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => Readonly<A> & {
        readonly _tag: "Retry";
    } & import("effect/Pipeable").Pipeable;
    export class Retry extends Retry_base<{
        userMessageID: string;
    }> {
    }
    export type TimelineRow = TurnGap | UserMessage | Shell | Notice | TurnDivider | AssistantPart | Thinking | Error | Retry;
    export const key: (row: TimelineRow) => string;
    export function equals(a: TimelineRow, b: TimelineRow): boolean;
    export {};
}
export type TimelineRowMap = {
    TurnGap: {
        userMessageID: string;
    };
    UserMessage: {
        userMessageID: string;
    };
    Shell: {
        userMessageID: string;
        messageID: string;
    };
    Notice: {
        userMessageID: string;
        messageID: string;
    };
    TurnDivider: {
        userMessageID: string;
    };
    AssistantPart: {
        userMessageID: string;
        group: PartGroup;
        previousAssistantPart: boolean;
        spacing?: "tool" | "content";
    };
    Thinking: {
        userMessageID: string;
        ref: PartRef;
    };
    Retry: {
        userMessageID: string;
    };
    Error: {
        userMessageID: string;
        text: string;
    };
};
