import { type ComponentProps } from "solid-js";
import { Card } from "@opencode/ui/card";
export interface ToolErrorCardProps extends Omit<ComponentProps<typeof Card>, "children" | "variant"> {
    tool: string;
    error: string;
    title?: string;
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    subtitle?: string;
    href?: string;
    onSubtitleClick?: (event: MouseEvent) => void;
}
export declare function ToolErrorCard(props: ToolErrorCardProps): import("solid-js").JSX.Element;
