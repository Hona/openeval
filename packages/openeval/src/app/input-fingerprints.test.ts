import { expect, test } from "bun:test";
import type { BenchmarkDefinition, BenchmarkRun } from "../types";
import { candidateFingerprint, candidateProviders } from "./input-fingerprints";

const definition: BenchmarkDefinition = {
  name: "SDK fixture",
  directory: "/benchmark",
  models: ["gateway/listed#high", "gateway/custom#high"],
  repetitions: 1,
  concurrency: 1,
  candidate: { timeoutMs: 1000, websearch: false },
  judge: { model: "local/judge", timeoutMs: 1000, websearch: false },
  container: { engine: "docker", image: "fixture", cpus: 1, memoryMiB: 1024 },
  evals: [
    {
      id: "answer",
      name: "Answer",
      directory: "/benchmark/evals/answer",
      prompt: "Supply the requested fact.",
      judge: "",
      judgeHash: "rubric",
      sourceHash: "workspace",
      settings: {},
      criteria: [],
    },
  ],
};
const runtime: BenchmarkRun["runtime"] = {
  imageId: "fixture-image",
  candidateHash: "candidate-runtime",
  judgeHash: "judge-runtime",
};
const custom = { name: "Custom", limit: { context: 1000, output: 100 } };
const withProviders = (
  providers: BenchmarkDefinition["candidate"]["providers"],
): BenchmarkDefinition => ({
  ...definition,
  candidate: { ...definition.candidate, providers },
});
const hash = (value: BenchmarkDefinition, model: "listed" | "custom") =>
  candidateFingerprint(value, "answer", `gateway/${model}#high`, runtime);

test("another model's provider override leaves a candidate's inputs unchanged", () => {
  const configured = withProviders({ gateway: { models: { custom } } });

  expect(hash(configured, "listed")).toBe(hash(definition, "listed"));
  expect(hash(withProviders({ gateway: {} }), "listed")).toBe(
    hash(definition, "listed"),
  );
  expect(
    candidateProviders(configured.candidate.providers, "gateway/listed#high"),
  ).toBeUndefined();
});

test("a candidate receives and fingerprints only its own provider configuration", () => {
  const providers = {
    gateway: { env: ["GATEWAY_KEY"], models: { custom, other: custom } },
    unrelated: { env: ["UNRELATED_KEY"] },
  } satisfies BenchmarkDefinition["candidate"]["providers"];

  expect(candidateProviders(providers, "gateway/custom#high")).toEqual({
    gateway: { env: ["GATEWAY_KEY"], models: { custom } },
  });
  expect(candidateProviders(providers, "gateway/listed#high")).toEqual({
    gateway: { env: ["GATEWAY_KEY"] },
  });
  expect(hash(withProviders(providers), "listed")).not.toBe(
    hash(definition, "listed"),
  );
  expect(
    hash(
      withProviders({
        ...providers,
        gateway: { ...providers!.gateway, models: { custom } },
      }),
      "custom",
    ),
  ).toBe(hash(withProviders(providers), "custom"));
});
