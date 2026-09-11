export type Block = {
    raw: string;
    src: string;
    mode: "full" | "live" | "code";
    language?: string;
    complete?: boolean;
};
export type Projection = {
    text: string;
    blocks: Block[];
};
export declare function stream(text: string, live: boolean): Block[];
export declare function project(previous: Projection | undefined, text: string, live: boolean): Projection;
