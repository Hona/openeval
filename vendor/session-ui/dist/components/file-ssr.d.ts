import { type FileProps } from "./file";
export type FileSSRProps<T = {}> = FileProps<T>;
export declare function FileSSR<T>(props: FileSSRProps<T>): import("solid-js").JSX.Element;
