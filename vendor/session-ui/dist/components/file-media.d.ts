import type { PresentationFileContent } from "../file-presentation";
import { type JSX } from "solid-js";
export type FileMediaOptions = {
    mode?: "auto" | "off";
    path?: string;
    current?: unknown;
    before?: unknown;
    after?: unknown;
    deleted?: boolean;
    readFile?: (path: string) => Promise<PresentationFileContent | undefined>;
    onLoad?: () => void;
    onError?: (ctx: {
        kind: "image" | "audio" | "svg";
    }) => void;
};
export declare function FileMedia(props: {
    media?: FileMediaOptions;
    fallback: () => JSX.Element;
}): JSX.Element;
