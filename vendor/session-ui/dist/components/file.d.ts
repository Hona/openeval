import { type DiffLineAnnotation, type FileContents, type FileDiffMetadata, type FileDiffOptions, type FileOptions, type LineAnnotation, type SelectedLineRange } from "@pierre/diffs";
import { type PreloadFileDiffResult, type PreloadMultiFileDiffResult } from "@pierre/diffs/ssr";
import { ComponentProps } from "solid-js";
import { type FileMediaOptions } from "./file-media";
type SharedProps<T> = {
    annotations?: LineAnnotation<T>[] | DiffLineAnnotation<T>[];
    selectedLines?: SelectedLineRange | null;
    commentedLines?: SelectedLineRange[];
    onLineNumberSelectionEnd?: (selection: SelectedLineRange | null) => void;
    onRendered?: () => void;
    class?: string;
    classList?: ComponentProps<"div">["classList"];
    media?: FileMediaOptions;
    search?: FileSearchControl;
};
export type FileSearchHandle = {
    focus: () => void;
};
export type FileSearchControl = {
    register: (handle: FileSearchHandle | null) => void;
};
export type TextFileProps<T = {}> = FileOptions<T> & SharedProps<T> & {
    mode: "text";
    file: FileContents;
    annotations?: LineAnnotation<T>[];
    preloadedDiff?: PreloadMultiFileDiffResult<T>;
};
type DiffPreload<T> = PreloadMultiFileDiffResult<T> | PreloadFileDiffResult<T>;
type DiffBaseProps<T> = FileDiffOptions<T> & SharedProps<T> & {
    mode: "diff";
    annotations?: DiffLineAnnotation<T>[];
    preloadedDiff?: DiffPreload<T>;
    virtualize?: boolean;
};
type DiffPairProps<T> = DiffBaseProps<T> & {
    before: FileContents;
    after: FileContents;
    fileDiff?: undefined;
};
type DiffPatchProps<T> = DiffBaseProps<T> & {
    fileDiff: FileDiffMetadata;
    before?: undefined;
    after?: undefined;
};
export type DiffFileProps<T = {}> = DiffPairProps<T> | DiffPatchProps<T>;
export type FileProps<T = {}> = TextFileProps<T> | DiffFileProps<T>;
export declare function File<T>(props: FileProps<T>): import("solid-js").JSX.Element;
export {};
