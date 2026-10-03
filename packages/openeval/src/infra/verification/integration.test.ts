import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { recordEvidence, judgeEvidence } from "../../app/judge-evidence";
import { VERIFICATION_IMAGE } from "./image";
import { prepareInputs } from "../../app/prepare-inputs";

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
 if (!result.artifacts.length) throw new Error((await ctx.verification.text(result, "stderr")) || JSON.stringify({exitCode:result.exitCode,missing:result.missingArtifacts}));
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

test.skipIf(process.env.OPENEVAL_VERIFY_INTEGRATION !== "1")("transfer limits reject oversized archives and retain opted-in capacity", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "openeval-transfer-capacity-"));
  try {
    const workspace = resolve(root, "workspace");
    for (const path of ["first/payload.txt", "second/payload.txt"])
      await Bun.write(resolve(workspace, path), "x".repeat(768 * 1024));
    const evidence = await recordEvidence({ directory: resolve(root, "evidence"), prompt: "Inspect the supplied files.",
      response: "Constructed control; no candidate or live model ran.", workspace: { initial: workspace, final: workspace } });
    const file = resolve(root, "judge.ts");
    await Bun.write(file, `export const criteria = { transferred: { name: "Transferred", categories: ["verification"] } };
export default async ctx => {
  const result = await ctx.verification.run({ commands: [["bun", "-e", "import {statSync} from 'node:fs'; if(statSync('/workspace/first/payload.txt').size !== 786432 || statSync('/workspace/second/payload.txt').size !== 786432) process.exit(1)"]], timeoutMs: 20000 });
  return { scores: { transferred: { value: result.exitCode === 0, reason: "Verified both restored files.", evidence: [{kind:"verification",id:result.id}] } } };
};`);
    const small = await judgeEvidence({ evidence, code: file, directory: resolve(root, "small"),
      judge: { timeoutMs: 30000, verification: { image: VERIFICATION_IMAGE, inputMiB: 1 } } });
    expect(small.state).toBe("failed");
    expect(small.error).toContain("exceeds 1 MiB");
    const large = await judgeEvidence({ evidence, code: file, directory: resolve(root, "large"),
      judge: { timeoutMs: 30000, verification: { image: VERIFICATION_IMAGE, inputMiB: 2 } } });
    expect(large.error).toBeUndefined();
    expect(large.judgment?.scores.transferred.value).toBe(1);
    expect(large.code?.verifications?.[0].environment.inputMiB).toBe(2);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 90000);

test.skipIf(process.env.OPENEVAL_VERIFY_INTEGRATION !== "1")("prepare actual inputs without candidate/judge executions or credentials", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "openeval-inputs-"));
  try {
    await Bun.write(resolve(root, "benchmark.ts"), 'export default {models:["example/disconnected"],candidate:{websearch:false}};');
    await Bun.write(resolve(root, "evals/example/prompt.md"), "Use the prepared file.");
    await Bun.write(resolve(root, "evals/example/judge.ts"), "export default () => ({scores:{ready:true}});");
    await Bun.write(resolve(root, "evals/example/workspace/input.txt"), "original input");
    await Bun.write(resolve(root, "evals/example/eval.ts"), 'export default {prepare:[{cwd:".",argv:["bun","-e",\'await Bun.write("ready.txt","prepared");\']}]};');
    const result = await prepareInputs(root, { directory: resolve(root, "prepared") });
    expect(result.candidateExecutions).toBe(0);
    expect(result.judgeExecutions).toBe(0);
    expect(await Bun.file(resolve(result.inputs[0].directory, "ready.txt")).text()).toBe("prepared");
    expect(await Bun.file(resolve(result.inputs[0].directory, "judge.ts")).exists()).toBe(false);
    expect(await Bun.file(resolve(root, "results/runner.db")).exists()).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 300000);
