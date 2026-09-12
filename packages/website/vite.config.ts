import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwind from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    tailwind(),
    solid({ ssr: true, include: [/\.[jt]sx$/], exclude: [] }),
  ],
  resolve: { dedupe: ["solid-js"] },
  optimizeDeps: { exclude: ["@opencode/ui"] },
  ssr: {
    noExternal: ["@opencode/ui", "@kobalte/core", /^@solid-primitives\//],
  },
  build: { target: "esnext", license: { fileName: "THIRD_PARTY_LICENSES.md" } },
});
