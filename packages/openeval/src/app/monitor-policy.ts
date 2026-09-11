import type { Eval, ModelRef, MonitorPolicy } from "../types";

/** Bound evaluator overhead; monitoring observes but never steers candidate work.
 * https://deepswe.datacurve.ai/blog/deepswe#beyond-pass-rate
 */
export function monitorPolicy(
  setting: Eval["earlyStop"],
  model?: ModelRef,
): MonitorPolicy | undefined {
  if (setting === undefined || setting === false) return;
  const options = setting === true ? {} : setting;
  if (
    typeof options !== "object" ||
    Object.keys(options).some(
      (key) =>
        !["minIntervalMs", "maxChecks", "maxCostUSD", "onlyModels"].includes(
          key,
        ),
    )
  )
    throw new Error("Invalid earlyStop policy");
  const policy = {
    minIntervalMs: options.minIntervalMs ?? 45_000,
    maxChecks: options.maxChecks ?? 12,
    maxCostUSD: options.maxCostUSD ?? 1,
  };
  if (
    !Number.isSafeInteger(policy.minIntervalMs) ||
    policy.minIntervalMs < 0 ||
    !Number.isSafeInteger(policy.maxChecks) ||
    policy.maxChecks < 1 ||
    !Number.isFinite(policy.maxCostUSD) ||
    policy.maxCostUSD < 0
  )
    throw new Error("Invalid earlyStop interval, check limit, or cost limit");
  if (
    options.onlyModels &&
    (!Array.isArray(options.onlyModels) ||
      !options.onlyModels.length ||
      options.onlyModels.some(
        (value) =>
          typeof value !== "string" || !/^[\w.-]+\/[^\s/]+$/.test(value),
      ))
  )
    throw new Error("earlyStop.onlyModels must list model references");
  if (model && options.onlyModels && !options.onlyModels.includes(model))
    return;
  return policy;
}
