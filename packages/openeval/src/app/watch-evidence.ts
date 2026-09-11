import type { EvidenceFeed, EvidenceView, JudgeSession } from "../evidence";
import type { EarlyDecision } from "../types";

/** Serial checks against fixed prefixes. Execution and persistence belong to the caller. */
export async function watchEvidence(
  feed: EvidenceFeed,
  check: JudgeSession["check"],
  signal: AbortSignal,
  options: {
    minIntervalMs?: number;
    maxChecks?: number;
    canCheck?: () => boolean;
    onLimit?: (reason: string) => void;
  } = {},
): Promise<
  | {
      view: EvidenceView;
      decision: Extract<EarlyDecision, { kind: "decided" }>;
    }
  | undefined
> {
  let revision = -1,
    checks = 0,
    lastStarted = 0;
  for (;;) {
    signal.throwIfAborted();
    if (
      checks >= (options.maxChecks ?? Infinity) ||
      options.canCheck?.() === false
    ) {
      options.onLimit?.(
        checks >= (options.maxChecks ?? Infinity)
          ? "Monitor check limit reached"
          : "Monitor cost limit reached",
      );
      return;
    }
    const wait = lastStarted + (options.minIntervalMs ?? 0) - Date.now();
    if (wait > 0)
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        }, wait);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
    const view = await feed.next(revision, signal);
    if (!view) return;
    lastStarted = Date.now();
    checks++;
    const decision = await check(view, signal);
    revision = view.checkpoint.revision;
    if (decision.kind === "decided") return { view, decision };
  }
}
