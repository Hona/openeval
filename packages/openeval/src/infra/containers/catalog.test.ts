import { expect, test } from "bun:test";
import { catalogRequests } from "./catalog";

const custom = { name: "Custom", limit: { context: 1000, output: 100 } };

test("catalog containers are scoped to one integration and its models' provider configuration", () => {
  const requests = catalogRequests({
    models: [
      "opencode/listed#high",
      "console-gateway/routed#high",
      "gateway/custom#high",
      "gateway/listed",
    ],
    candidate: {
      timeoutMs: 1000,
      websearch: false,
      providers: {
        "console-gateway": { env: ["ROUTED_KEY"] },
        gateway: { env: ["GATEWAY_KEY"], models: { custom, unused: custom } },
        unrelated: { env: ["UNRELATED_KEY"] },
      },
    },
  });

  expect(requests).toEqual([
    {
      integration: "opencode",
      models: ["opencode/listed#high", "console-gateway/routed#high"],
      providers: { "console-gateway": { env: ["ROUTED_KEY"] } },
    },
    {
      integration: "gateway",
      models: ["gateway/custom#high", "gateway/listed"],
      providers: { gateway: { env: ["GATEWAY_KEY"], models: { custom } } },
    },
  ]);
});
