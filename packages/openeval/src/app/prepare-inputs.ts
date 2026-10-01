import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { loadBenchmark } from "./load-benchmark";
import { prepareWorkspace } from "../infra/containers/workspace";
import { CandidateContainer, inspectImage } from "../infra/containers/oci";
import { createSessionDatabase } from "../infra/opencode/host";
import { treeHash, writeJson } from "../infra/files";

/** Prove preparation without prompting a model, creating EvalRuns, or changing selections. */
export async function prepareInputs(path: string, options: { directory: string; onlyEvals?: readonly string[] }) {
  const definition = await loadBenchmark(path);
  if (options.onlyEvals?.some(id => !definition.evals.some(item => item.id === id)))
    throw new Error("Select configured evals for preparation");
  const directory = resolve(options.directory);
  if (await Bun.file(resolve(directory, "prepared.json")).exists()) throw new Error("Choose a new prepared-input directory");
  const imageId = await inspectImage(definition.container);
  const scratch = await mkdtemp(resolve(process.platform === "win32" ? "C:/tmp/opencode" : tmpdir(), "openeval-prepare-"));
  const inputs: Array<{ eval: string; directory: string; sourceHash: string; preparedHash: string }> = [];
  try {
    await mkdir(directory, { recursive: true });
    for (const item of definition.evals.filter(item => !options.onlyEvals || options.onlyEvals.includes(item.id))) {
      const staging = resolve(scratch, item.id);
      await mkdir(staging, { recursive: true });
      const workspace = resolve(staging, "workspace");
      await prepareWorkspace(item, workspace);
      const database = resolve(staging, "opencode.db");
      // No credentials or model route are needed to prepare task inputs.
      await createSessionDatabase(database, []);
      await using container = await CandidateContainer.create(definition.container, imageId);
      await container.prepare(workspace, database, definition.candidate.websearch, item.settings.prepare ?? [], staging, definition.candidate.providers);
      const output = resolve(directory, item.id, "workspace");
      await container.snapshot(output, staging);
      inputs.push({ eval: item.id, directory: output, sourceHash: item.sourceHash, preparedHash: await treeHash(output) });
    }
    const result = { imageId, inputs, candidateExecutions: 0, judgeExecutions: 0 };
    await writeJson(resolve(directory, "prepared.json"), result);
    return result;
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
