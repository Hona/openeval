import { fileURLToPath } from "node:url";
import type { VerificationEnvironment, VerificationRuntime } from "../../judge-context";
import { engineCommand } from "../containers/docker";
import { treeHash } from "../files";

export const VERIFICATION_IMAGE = "openeval-verification:0.5.0";
const directory = fileURLToPath(new URL("./runtime/", import.meta.url));

export async function buildVerificationImage(environment: VerificationEnvironment) {
  if (environment.image !== VERIFICATION_IMAGE)
    throw new Error("Build custom verification images with your container engine; image --verification builds the standard image only");
  await engineCommand(environment.engine ?? "docker", [
    "build", "--label", `openeval.verification=${await treeHash(directory)}`,
    "-t", environment.image, directory,
  ], { timeoutMs: 600_000 });
}

export async function verificationRuntime(environment?: VerificationEnvironment): Promise<VerificationRuntime | undefined> {
  if (!environment) return undefined;
  const engine = environment.engine ?? "docker";
  if (!["docker", "podman"].includes(engine) || !environment.image || /\s/.test(environment.image) ||
    [environment.cpus ?? 2, environment.memoryMiB ?? 4096].some(value => !Number.isSafeInteger(value) || value < 1))
    throw new Error("Verification requires a valid image, engine, and positive integer resource limits");
  const output = await engineCommand(engine, [
    "image", "inspect", environment.image, "--format",
    '{{.Id}}|{{index .Config.Labels "openeval.verification"}}',
  ]);
  const [imageId, label] = output.split("|");
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId)) throw new Error("Verification image has no immutable image ID");
  if (environment.image === VERIFICATION_IMAGE && label !== await treeHash(directory))
    throw new Error("Verification runtime changed. Run image --verification first.");
  return { engine, image: environment.image, imageId, cpus: environment.cpus ?? 2, memoryMiB: environment.memoryMiB ?? 4096 };
}
