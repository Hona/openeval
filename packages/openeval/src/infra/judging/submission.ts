import { randomUUID } from "node:crypto";
import type { EvidenceView } from "../../evidence";
import type { JudgeCheck, MetricDefinition } from "../../types";
import { errorMessage } from "../files";
import { validateCitations, validateMetrics } from "./contract";

export type JudgePhase = "early" | "final";
export type JudgeDecision = NonNullable<JudgeCheck["decision"]>;
export type SubmissionAudit = {
  requestId: string;
  phase: JudgePhase;
  checkId?: string;
  checkpoint: EvidenceView["checkpoint"];
  tool: "submit_judgment" | "continue_judging";
  input: unknown;
  startedAt: string;
  completedAt?: string;
  result?: JudgeDecision;
  error?: string;
};

/** One submission channel per fixed view. Never parse the model's final text. */
export class JudgeRequest {
  readonly id = randomUUID();
  closed = false;
  private submitting = false;
  private accepted?: JudgeDecision;

  constructor(
    readonly phase: JudgePhase,
    readonly evidence: EvidenceView,
    readonly metrics: readonly MetricDefinition[],
    private readonly audit: SubmissionAudit[],
    readonly checkId?: string,
    private readonly signal?: AbortSignal,
  ) {}

  assertActive() {
    this.signal?.throwIfAborted();
    if (this.closed)
      throw new Error(
        "This judge request has closed; its evidence is no longer active",
      );
  }

  context() {
    this.assertActive();
    return {
      requestId: this.id,
      phase: this.phase,
      metrics: this.metrics,
      evidence: this.evidence.summary(),
    };
  }

  submit(input: { requestId: string; metrics: unknown }) {
    return this.accept("submit_judgment", input, async () => {
      const judgment = validateMetrics(input.metrics, this.metrics);
      if (this.phase === "early" && judgment.value === null)
        throw new Error(
          "Early checks require every metric to be decided. Use continue_judging when evidence is insufficient",
        );
      await validateCitations(judgment, this.evidence);
      return { kind: "decided", judgment };
    });
  }

  continue(input: { requestId: string; reason: string }) {
    return this.accept("continue_judging", input, async () => {
      if (this.phase !== "early")
        throw new Error(
          "Final grading requires submit_judgment; unresolved metrics can be null",
        );
      if (typeof input.reason !== "string" || !input.reason.trim())
        throw new Error("Explain what evidence is still needed");
      return { kind: "continue", reason: input.reason };
    });
  }

  result(): JudgeDecision {
    this.assertActive();
    if (!this.accepted)
      throw new Error(
        "Judge ended without an accepted submission through submit_judgment or continue_judging",
      );
    return structuredClone(this.accepted);
  }

  close() {
    this.closed = true;
  }

  private async accept(
    tool: SubmissionAudit["tool"],
    input: { requestId: string },
    work: () => Promise<JudgeDecision>,
  ): Promise<{ accepted: true }> {
    const entry: SubmissionAudit = {
      requestId: this.id,
      phase: this.phase,
      checkId: this.checkId,
      checkpoint: this.evidence.checkpoint,
      tool,
      input: structuredClone(input),
      startedAt: new Date().toISOString(),
    };
    this.audit.push(entry);
    let acquired = false;
    try {
      this.assertActive();
      if (input.requestId !== this.id)
        throw new Error(
          "Stale requestId; read judge_context for the current request",
        );
      if (this.accepted)
        throw new Error(
          "A result is already accepted for this request; finish the turn",
        );
      if (this.submitting)
        throw new Error(
          "Another submission is being validated; await it before submitting again",
        );
      this.submitting = acquired = true;
      const decision = await work();
      // Citation reads can outlive cancellation. They must not commit into a later check.
      this.assertActive();
      this.accepted = structuredClone(decision);
      entry.result = structuredClone(decision);
      return { accepted: true };
    } catch (error) {
      entry.error = errorMessage(error);
      throw error;
    } finally {
      if (acquired) this.submitting = false;
      entry.completedAt = new Date().toISOString();
    }
  }
}
