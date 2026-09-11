import type { UiI18nPluralKey } from "@opencode/ui/context";
export type CountItem = {
    key: UiI18nPluralKey;
    count: number;
};
export declare function AnimatedCountList(props: {
    items: CountItem[];
    fallback?: string;
    class?: string;
}): import("solid-js").JSX.Element;
