import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { BenchmarkDefinition, ModelNames } from "../../types";
import { CandidateContainer } from "./oci";
import { createSessionDatabase } from "../opencode/host";
import { createCredentialSnapshot, integrationFor } from "../opencode/auth";
import { clientFor, parseModel } from "../opencode/session";

const CATALOG_TIMEOUT_MS = 60_000;

/** Display names from the candidates' OpenCode catalog, including declared provider overrides. */
export async function readModelNames(
  definition: Pick<BenchmarkDefinition, "models" | "candidate" | "container">,
  imageId: string,
): Promise<ModelNames> {
  const staging = await mkdtemp(
    resolve(process.env.TMP ?? tmpdir(), "catalog-"),
  );
  try {
    const workspace = resolve(staging, "workspace"),
      database = resolve(staging, "opencode.db");
    await mkdir(workspace);
    await createSessionDatabase(
      database,
      createCredentialSnapshot(undefined, [
        ...new Set(definition.models.map(integrationFor)),
      ]),
    );
    await using container = await CandidateContainer.create(
      definition.container,
      imageId,
    );
    await container.prepare(
      workspace,
      database,
      false,
      [],
      staging,
      definition.candidate.providers,
    );
    const client = clientFor(
      await container.start(CATALOG_TIMEOUT_MS),
      container.password,
    );
    const location = { directory: "/workspace" };
    await client.plugin.awaitActivation({ location });
    const listed = (await client.model.list({ location })).data;
    return Object.fromEntries(
      definition.models.flatMap((model) => {
        const selected = parseModel(model),
          found = listed.find(
            (item) =>
              item.providerID === selected.providerID &&
              item.id === selected.id,
          );
        return found?.name
          ? [[`${selected.providerID}/${selected.id}`, found.name]]
          : [];
      }),
    );
  } finally {
    await rm(staging, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
}
