import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE } from "./src/examples";

const directory = fileURLToPath(new URL("./", import.meta.url));

export const demoHtml = (html: string) =>
  html
    .replace(
      "<title>OpenEval | Results</title>",
      "<title>OpenEval | Demo</title>",
    )
    .replace(
      "</head>",
      `<link rel="canonical" href="${SITE}/demo/"><link rel="alternate" type="text/markdown" href="/demo/index.md"><link rel="describedby" href="/llms.txt"><script id="openeval-source" type="application/json">{"manifest":"./data/manifest.json","title":"OpenEval | Demo","home":"/"}</script></head>`,
    );

/** Bundle the existing viewer once; the website only supplies its data-source configuration. */
export async function buildDemo(output = resolve(directory, "dist/demo")) {
  const viewer = resolve(directory, "../viewer");
  const build = Bun.spawn(
    [
      "bun",
      "x",
      "--bun",
      "--no-install",
      "vite",
      "build",
      "--config",
      "vite.config.ts",
    ],
    { cwd: viewer, stdout: "inherit", stderr: "inherit" },
  );
  if (await build.exited) throw new Error("Demo viewer build failed");
  await mkdir(output, { recursive: true });
  await cp(resolve(viewer, "dist/assets"), resolve(output, "assets"), {
    recursive: true,
  });
  await cp(resolve(directory, "demo/recording"), resolve(output, "data"), {
    recursive: true,
  });
  const html = demoHtml(
    await readFile(resolve(viewer, "dist/index.html"), "utf8"),
  );
  await writeFile(resolve(output, "index.html"), html);
}

if (import.meta.main)
  await buildDemo(process.argv[2] ? resolve(process.argv[2]) : undefined);
