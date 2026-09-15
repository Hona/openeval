import { expect, test } from "bun:test";
import type { EvidenceView } from "../../evidence";
import { JudgeRequest, type SubmissionAudit } from "./submission";

const criteria = [{ id: "answer", name: "Answer" }];
const evidence: EvidenceView = {
  checkpoint: {
    directory: "evidence",
    hash: "snapshot",
    revision: 1,
    through: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  summary: () => ({ coverage: "recorded-session" }),
  query: async () => ({ text: "Ready", next: null }),
};
const scores = (value: 0 | 1 | null, quote = "Ready") => ({
  answer: {
    value,
    reason: "Recorded answer",
    evidence: value === null ? [] : [{ kind: "response", quote }],
  },
});

test("rejects invalid citations in the tool and accepts a corrected submission once", async () => {
  const audit: SubmissionAudit[] = [];
  const request = new JudgeRequest("final", evidence, criteria, audit);
  await expect(
    request.submit({ requestId: request.id, scores: scores(1, "invented") }),
  ).rejects.toThrow("quote was not found");
  expect(() => request.result()).toThrow("without an accepted submission");
  await expect(
    request.submit({ requestId: request.id, scores: scores(1) }),
  ).resolves.toEqual({ accepted: true });
  await expect(
    request.submit({ requestId: request.id, scores: scores(0) }),
  ).rejects.toThrow("already accepted");
  expect(request.result()).toMatchObject({
    kind: "decided",
    judgment: { value: 1 },
  });
  expect(audit).toHaveLength(3);
  expect(audit[0].error).toContain("quote was not found");
  expect(audit[1].result).toMatchObject({
    kind: "decided",
    judgment: { value: 1 },
  });
});

test("early checks continue on unknowns while final grading can submit null", async () => {
  const early = new JudgeRequest("early", evidence, criteria, []);
  await expect(
    early.submit({ requestId: early.id, scores: scores(null) }),
  ).rejects.toThrow("Use continue_judging");
  await early.continue({ requestId: early.id, reason: "Wait for the answer" });
  expect(early.result()).toEqual({
    kind: "continue",
    reason: "Wait for the answer",
  });
  const final = new JudgeRequest("final", evidence, criteria, []);
  await expect(
    final.continue({ requestId: final.id, reason: "Wait" }),
  ).rejects.toThrow("Final grading requires");
  await final.submit({ requestId: final.id, scores: scores(null) });
  expect(final.result()).toMatchObject({
    kind: "decided",
    judgment: { value: null },
  });
});

test("pending validation cannot commit after cancellation or replace another request", async () => {
  const pending = Promise.withResolvers<Record<string, unknown>>();
  const signal = new AbortController();
  const old = new JudgeRequest(
    "early",
    { ...evidence, query: () => pending.promise },
    criteria,
    [],
    "first-check",
    signal.signal,
  );
  const submitted = old.submit({ requestId: old.id, scores: scores(1) });
  await expect(
    old.continue({ requestId: old.id, reason: "Changed my mind" }),
  ).rejects.toThrow("being validated");
  await expect(
    old.submit({ requestId: old.id, scores: scores(0) }),
  ).rejects.toThrow("being validated");
  signal.abort();
  old.close();
  const current = new JudgeRequest("final", evidence, criteria, []);
  pending.resolve({ text: "Ready", next: null });
  await expect(submitted).rejects.toThrow();
  await expect(
    current.submit({ requestId: old.id, scores: scores(1) }),
  ).rejects.toThrow("Stale requestId");
  expect(() => current.result()).toThrow("without an accepted submission");
  await current.submit({ requestId: current.id, scores: scores(0) });
  expect(current.result()).toMatchObject({
    kind: "decided",
    judgment: { value: 0 },
  });
});

test("all required criteria are submitted together and averaged by the host", async () => {
  const request = new JudgeRequest(
    "early",
    evidence,
    [...criteria, { id: "other", name: "Other" }],
    [],
  );
  await expect(
    request.submit({ requestId: request.id, scores: scores(1) }),
  ).rejects.toThrow("exactly these criterion IDs");
  await request.submit({
    requestId: request.id,
    scores: { ...scores(1), other: scores(0).answer },
  });
  expect(request.result()).toMatchObject({
    kind: "decided",
    judgment: { value: 0.5 },
  });
});
