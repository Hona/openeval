import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { serveResults } from "@hona/openeval";

const benchmark = process.argv[2];
if (!benchmark) throw new Error("Usage: viewer <benchmark directory>");
const api = await serveResults({
  resultsPath: resolve(benchmark, "results"),
  port: 0,
});
const vite = await createServer({
  configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
  server: { port: 4173, strictPort: true, proxy: { "/api": api.url } },
});
await vite.listen();
console.log(`OpenEval viewer: ${vite.resolvedUrls?.local[0]}`);
let closed = false;
const close = async () => {
  if (closed) return;
  closed = true;
  await api.close();
  await vite.close();
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
