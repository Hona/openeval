export declare function FileSearchBar(props: {
    pos: {
        top: number;
        right: number;
    };
    query: string;
    index: number;
    count: number;
    setInput: (el: HTMLInputElement) => void;
    onInput: (value: string) => void;
    onKeyDown: (event: KeyboardEvent) => void;
    onClose: () => void;
    onPrev: () => void;
    onNext: () => void;
}): import("solid-js").JSX.Element;
