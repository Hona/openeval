export type FindHost = {
    element: () => HTMLElement | undefined;
    open: () => void;
    close: () => void;
    next: (dir: 1 | -1) => void;
    isOpen: () => boolean;
};
type CreateFileFindOptions = {
    wrapper: () => HTMLElement | undefined;
    overlay: () => HTMLDivElement | undefined;
    getRoot: () => ShadowRoot | undefined;
};
export declare function createFileFind(opts: CreateFileFindOptions): {
    open: () => boolean;
    query: () => string;
    count: () => number;
    index: () => number;
    pos: () => {
        top: number;
        right: number;
    };
    setInput: (el: HTMLInputElement) => void;
    setQuery: (value: string) => void;
    focus: () => void;
    close: () => void;
    next: (dir: 1 | -1) => void;
    refresh: (args?: {
        reset?: boolean;
        scroll?: boolean;
    }) => void;
    onPointerDown: () => void;
    onFocus: () => void;
    onInputKeyDown: (event: KeyboardEvent) => void;
};
export {};
