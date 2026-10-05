import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type {
  BenchmarkDefinition,
  ModelNames,
  ModelRef,
  ProviderDefinitions,
} from "../../types";
import { CandidateContainer } from "./oci";
import { createSessionDatabase } from "../opencode/host";
import { createCredentialSnapshot, integrationFor } from "../opencode/auth";
import {
  awaitPluginActivation,
  clientFor,
  parseModel,
} from "../opencode/session";
import { candidateProviders } from "../../app/input-fingerprints";

const CATALOG_TIMEOUT_MS = 60_000;

type CatalogDefinition = Pick<
  BenchmarkDefinition,
  "models" | "candidate" | "container"
>;

/** Display names from the candidates' OpenCode catalog, including declared provider overrides.
 * Like candidates, each container receives only one integration's credentials and its models' provider configuration.
 */
export async function readModelNames(
  definition: CatalogDefinition,
  imageId: string,
): Promise<ModelNames> {
  const names = await Promise.all(
    catalogRequests(definition).map((request) =>
      readIntegrationNames(definition.container, imageId, request).catch(
        () => ({}),
      ),
    ),
  );
  return Object.assign({}, ...names);
}

export type CatalogRequest = {
  integration: string;
  models: readonly ModelRef[];
  providers?: ProviderDefinitions;
};

/** One request per credential integration, scoped like the candidates it names. */
export const catalogRequests = (
  definition: Pick<BenchmarkDefinition, "models" | "candidate">,
): CatalogRequest[] =>
  [...Map.groupBy(definition.models, integrationFor)].map(
    ([integration, models]) => ({
      integration,
      models,
      providers: scopedProviders(definition.candidate.providers, models),
    }),
  );

async function readIntegrationNames(
  container: BenchmarkDefinition["container"],
  imageId: string,
  { integration, models, providers }: CatalogRequest,
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
      createCredentialSnapshot(undefined, [integration]),
    );
    await using catalog = await CandidateContainer.create(container, imageId);
    await catalog.prepare(workspace, database, false, [], staging, providers);
    const client = clientFor(
      await catalog.start(CATALOG_TIMEOUT_MS),
      catalog.password,
    );
    const location = { directory: "/workspace" };
    await awaitPluginActivation(client, location);
    const listed = (await client.model.list({ location })).data;
    return Object.fromEntries(
      models.flatMap((model) => {
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

/** Union of what each listed candidate would receive, without other providers' entries. */
function scopedProviders(
  providers: ProviderDefinitions | undefined,
  models: readonly ModelRef[],
): ProviderDefinitions | undefined {
  let scoped: NonNullable<ProviderDefinitions> | undefined;
  for (const model of models)
    for (const [id, entry] of Object.entries(
      candidateProviders(providers, model) ?? {},
    )) {
      scoped ??= {};
      scoped[id] = {
        ...scoped[id],
        ...entry,
        ...(scoped[id]?.models || entry.models
          ? { models: { ...scoped[id]?.models, ...entry.models } }
          : {}),
      };
    }
  return scoped;
}
