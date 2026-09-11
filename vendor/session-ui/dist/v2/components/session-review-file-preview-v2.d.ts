import type { FileDiffInfo } from "@opencode/client/promise";
import type { PresentationFileContent, PresentationFileDiff } from "../../file-presentation";
import type { SessionReviewComment, SessionReviewCommentActions, SessionReviewCommentDelete, SessionReviewCommentUpdate, SessionReviewDiffStyle, SessionReviewFocus, SessionReviewLineComment } from "../../components/session-review";
import type { SessionReviewExpandMode } from "./session-review-v2";
import "./session-review-v2.css";
type ReviewDiff = (PresentationFileDiff & {
    file: string;
}) | FileDiffInfo;
export type SessionReviewFilePreviewV2Props = {
    file: string;
    diff: ReviewDiff;
    diffStyle: SessionReviewDiffStyle;
    expandMode?: SessionReviewExpandMode;
    readFile?: (path: string) => Promise<PresentationFileContent | undefined>;
    onLineComment?: (comment: SessionReviewLineComment) => void;
    onLineCommentUpdate?: (comment: SessionReviewCommentUpdate) => void;
    onLineCommentDelete?: (comment: SessionReviewCommentDelete) => void;
    lineCommentActions?: SessionReviewCommentActions;
    comments?: SessionReviewComment[];
    focusedComment?: SessionReviewFocus | null;
    onFocusedCommentChange?: (focus: SessionReviewFocus | null) => void;
};
export declare function SessionReviewFilePreviewV2(props: SessionReviewFilePreviewV2Props): import("solid-js").JSX.Element;
export {};
