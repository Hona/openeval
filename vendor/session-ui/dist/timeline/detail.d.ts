import type { SessionMessageAssistant, SessionMessageInfo } from "@opencode/client/promise";
export declare const timelineCategories: readonly ["shell", "edit", "thinking", "subagents", "notices", "tools"];
export type TimelineCategory = (typeof timelineCategories)[number];
export type TimelinePlacement = "separate" | "grouped" | "hidden";
export type TimelineExpansion = "collapsed" | "expanded";
export type TimelineDetail = {
    shell: {
        placement: TimelinePlacement;
        details: TimelineExpansion;
    };
    edit: {
        placement: TimelinePlacement;
        details: TimelineExpansion;
    };
    thinking: {
        placement: TimelinePlacement;
        details: TimelineExpansion;
    };
    subagents: {
        placement: TimelinePlacement;
    };
    notices: {
        placement: TimelinePlacement;
    };
    tools: {
        placement: TimelinePlacement;
    };
};
export declare const timelinePresets: readonly [{
    readonly id: "everything";
    readonly value: {
        readonly shell: {
            readonly placement: "separate";
            readonly details: "expanded";
        };
        readonly edit: {
            readonly placement: "separate";
            readonly details: "expanded";
        };
        readonly thinking: {
            readonly placement: "separate";
            readonly details: "expanded";
        };
        readonly subagents: {
            readonly placement: "separate";
        };
        readonly notices: {
            readonly placement: "separate";
        };
        readonly tools: {
            readonly placement: "separate";
        };
    };
}, {
    readonly id: "detailed";
    readonly value: {
        readonly shell: {
            readonly placement: "separate";
            readonly details: "expanded";
        };
        readonly edit: {
            readonly placement: "separate";
            readonly details: "expanded";
        };
        readonly thinking: {
            readonly placement: "grouped";
            readonly details: "collapsed";
        };
        readonly subagents: {
            readonly placement: "separate";
        };
        readonly notices: {
            readonly placement: "grouped";
        };
        readonly tools: {
            readonly placement: "grouped";
        };
    };
}, {
    readonly id: "compact";
    readonly value: {
        readonly shell: {
            readonly placement: "grouped";
            readonly details: "collapsed";
        };
        readonly edit: {
            readonly placement: "grouped";
            readonly details: "collapsed";
        };
        readonly thinking: {
            readonly placement: "grouped";
            readonly details: "collapsed";
        };
        readonly subagents: {
            readonly placement: "grouped";
        };
        readonly notices: {
            readonly placement: "grouped";
        };
        readonly tools: {
            readonly placement: "grouped";
        };
    };
}, {
    readonly id: "quiet";
    readonly value: {
        readonly shell: {
            readonly placement: "hidden";
            readonly details: "collapsed";
        };
        readonly edit: {
            readonly placement: "grouped";
            readonly details: "collapsed";
        };
        readonly thinking: {
            readonly placement: "hidden";
            readonly details: "collapsed";
        };
        readonly subagents: {
            readonly placement: "grouped";
        };
        readonly notices: {
            readonly placement: "hidden";
        };
        readonly tools: {
            readonly placement: "hidden";
        };
    };
}, {
    readonly id: "text-only";
    readonly value: {
        readonly shell: {
            readonly placement: "hidden";
            readonly details: "collapsed";
        };
        readonly edit: {
            readonly placement: "hidden";
            readonly details: "collapsed";
        };
        readonly thinking: {
            readonly placement: "hidden";
            readonly details: "collapsed";
        };
        readonly subagents: {
            readonly placement: "hidden";
        };
        readonly notices: {
            readonly placement: "hidden";
        };
        readonly tools: {
            readonly placement: "hidden";
        };
    };
}];
export declare function timelinePreset(value: TimelineDetail): {
    readonly id: "everything";
    readonly value: {
        readonly shell: {
            readonly placement: "separate";
            readonly details: "expanded";
        };
        readonly edit: {
            readonly placement: "separate";
            readonly details: "expanded";
        };
        readonly thinking: {
            readonly placement: "separate";
            readonly details: "expanded";
        };
        readonly subagents: {
            readonly placement: "separate";
        };
        readonly notices: {
            readonly placement: "separate";
        };
        readonly tools: {
            readonly placement: "separate";
        };
    };
} | {
    readonly id: "detailed";
    readonly value: {
        readonly shell: {
            readonly placement: "separate";
            readonly details: "expanded";
        };
        readonly edit: {
            readonly placement: "separate";
            readonly details: "expanded";
        };
        readonly thinking: {
            readonly placement: "grouped";
            readonly details: "collapsed";
        };
        readonly subagents: {
            readonly placement: "separate";
        };
        readonly notices: {
            readonly placement: "grouped";
        };
        readonly tools: {
            readonly placement: "grouped";
        };
    };
} | {
    readonly id: "compact";
    readonly value: {
        readonly shell: {
            readonly placement: "grouped";
            readonly details: "collapsed";
        };
        readonly edit: {
            readonly placement: "grouped";
            readonly details: "collapsed";
        };
        readonly thinking: {
            readonly placement: "grouped";
            readonly details: "collapsed";
        };
        readonly subagents: {
            readonly placement: "grouped";
        };
        readonly notices: {
            readonly placement: "grouped";
        };
        readonly tools: {
            readonly placement: "grouped";
        };
    };
} | {
    readonly id: "quiet";
    readonly value: {
        readonly shell: {
            readonly placement: "hidden";
            readonly details: "collapsed";
        };
        readonly edit: {
            readonly placement: "grouped";
            readonly details: "collapsed";
        };
        readonly thinking: {
            readonly placement: "hidden";
            readonly details: "collapsed";
        };
        readonly subagents: {
            readonly placement: "grouped";
        };
        readonly notices: {
            readonly placement: "hidden";
        };
        readonly tools: {
            readonly placement: "hidden";
        };
    };
} | {
    readonly id: "text-only";
    readonly value: {
        readonly shell: {
            readonly placement: "hidden";
            readonly details: "collapsed";
        };
        readonly edit: {
            readonly placement: "hidden";
            readonly details: "collapsed";
        };
        readonly thinking: {
            readonly placement: "hidden";
            readonly details: "collapsed";
        };
        readonly subagents: {
            readonly placement: "hidden";
        };
        readonly notices: {
            readonly placement: "hidden";
        };
        readonly tools: {
            readonly placement: "hidden";
        };
    };
};
export declare function timelineCategory(content: SessionMessageAssistant["content"][number]): keyof TimelineDetail | undefined;
export declare function timelineNoticeRequired(message: SessionMessageInfo): boolean;
