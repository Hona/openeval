import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwind from "@tailwindcss/vite";
import { githubStarCount } from "./github-stars";
import { agentDocumentation } from "./agent-plugin";

export default defineConfig(async () => {
  const stars =
    process.env.OPENEVAL_GITHUB_STARS === undefined
      ? await githubStarCount()
      : Number(process.env.OPENEVAL_GITHUB_STARS);
  if (!Number.isSafeInteger(stars) || stars < 0)
    throw new Error("Invalid GitHub star count");
  return {
    define: { __GITHUB_STARS__: JSON.stringify(stars) },
    plugins: [
      agentDocumentation(),
      tailwind(),
      solid({ ssr: true, include: [/\.[jt]sx$/], exclude: [] }),
    ],
    resolve: { dedupe: ["solid-js"] },
    optimizeDeps: { exclude: ["@opencode/ui"] },
    ssr: {
      noExternal: ["@opencode/ui", "@kobalte/core", /^@solid-primitives\//],
    },
    build: {
      target: "esnext",
      license: { fileName: "THIRD_PARTY_LICENSES.md" },
    },
  };
});
