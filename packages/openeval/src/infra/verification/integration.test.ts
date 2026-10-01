import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { recordEvidence, judgeEvidence } from "../../app/judge-evidence";
import { VERIFICATION_IMAGE } from "./image";

// Explicit CI-only, no-model integration check. Ordinary unit tests need no engine.
test.skipIf(process.env.OPENEVAL_VERIFY_INTEGRATION !== "1")("verify restored artifacts, retain outputs, and deny mutation of the trusted check", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "openeval-verifier-"));
  try {
    const initial = resolve(root, "initial"), final = resolve(root, "final");
    await Bun.write(resolve(initial, "answer.mjs"), "export default 1;");
    await Bun.write(resolve(final, "answer.mjs"), "export default 2;");
    const evidence = await recordEvidence({ directory: resolve(root, "evidence"), prompt: "Change the answer.", response: "Done.", workspace: { initial, final } });
    const check = `import answer from '/workspace/answer.mjs';
import { writeFileSync } from 'node:fs';
if (answer !== 2) process.exit(1);
let denied = false;
try { writeFileSync('/verification/check.mjs', 'corrupted'); } catch { denied = true; }
if (!denied) throw new Error('Trusted verification is writable');
writeFileSync('/workspace/result.json', JSON.stringify({answer,denied}));`;
    const file = resolve(root, "judge.ts");
    await Bun.write(file, `export const criteria = { correct: { name: "Correct", categories: ["coding"] } };
export default async ctx => {
 const result = await ctx.verification.run({ commands: [["bun", "/verification/check.mjs"]], files: { "check.mjs": ${JSON.stringify(check)} }, artifacts: ["result.json"], timeoutMs: 20000 });
 const values = JSON.parse(await ctx.verification.text(result, "result.json"));
 return { scores: { correct: {value: result.exitCode === 0, reason: "Verified the final answer in isolation.", evidence: [{kind:"verification",id:result.id,path:"result.json"}], measurements: values} } };
};`);
    const result = await judgeEvidence({ evidence, code: file, judge: { timeoutMs: 30000, verification: { image: VERIFICATION_IMAGE } }, directory: resolve(root, "judged") });
    expect(result.error).toBeUndefined();
    expect(result.state).toBe("completed");
    expect(result.judgment?.scores.correct.reason).toBe("Verified the final answer in isolation.");
    expect(result.judgment?.scores.correct.measurements).toEqual({ answer: 2, denied: true });
    expect(result.code?.verifications?.[0].artifacts[0].sha256).toHaveLength(64);
    expect(await Bun.file(resolve(final, "answer.mjs")).text()).toBe("export default 2;");
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60000);
