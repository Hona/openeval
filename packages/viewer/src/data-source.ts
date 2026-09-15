import { createServerSource } from "./data/server";
import { createSavedSource } from "./data/saved";
import type { ViewerConfig, ViewerDataSource, ViewerIO } from "./data/types";

/** Composition only; components consume the typed source contract through context. */
export function createViewerSource(
  config: ViewerConfig = {},
  options: ViewerIO = {},
): ViewerDataSource {
  const io = {
    ...options,
    base:
      options.base ??
      (typeof location === "undefined" ? "http://localhost/" : location.href),
  };
  return config.manifest
    ? createSavedSource(config.manifest, io)
    : createServerSource(io);
}
