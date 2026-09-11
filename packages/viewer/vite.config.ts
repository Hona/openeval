import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("./src/", import.meta.url)),
  plugins: [tailwind(), solid({ include: [/\.[jt]sx$/], exclude: [] })],
  resolve: { dedupe: ["solid-js", "@solidjs/meta"] },
  optimizeDeps: {
    exclude: ["@opencode/ui", "@opencode/session-ui"],
    // The excluded session UI imports @pierre/diffs, which loads CommonJS lru_map.
    // Pre-bundle every used entry so Vite applies ESM interop in development.
    include: [
      "@opencode/session-ui > @pierre/diffs",
      "@opencode/session-ui > @pierre/diffs/ssr",
      "@opencode/session-ui > @pierre/diffs/worker",
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4180" },
    fs: {
      strict: true,
      allow: [
        fileURLToPath(new URL(".", import.meta.url)),
        fileURLToPath(new URL("../../node_modules", import.meta.url)),
        fileURLToPath(new URL("../openeval/src/view.ts", import.meta.url)),
        fileURLToPath(new URL("../openeval/src/types.ts", import.meta.url)),
        fileURLToPath(
          new URL("../openeval/src/session-replay.ts", import.meta.url),
        ),
      ],
    },
  },
  build: {
    license: { fileName: "THIRD_PARTY_LICENSES.md" },
    outDir: fileURLToPath(new URL("./dist/", import.meta.url)),
    emptyOutDir: true,
    target: "esnext",
  },
});
