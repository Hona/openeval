import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { docs, docHref } from "./src/content";
import { SITE } from "./src/examples";
import "./prepare";

const directory = fileURLToPath(new URL("./", import.meta.url));
for (const args of [
  ["build"],
  [
    "build",
    "--ssr",
    "src/entry-server.tsx",
    "--outDir",
    ".ssr",
    "--emptyOutDir",
  ],
]) {
  const child = Bun.spawn(["bun", "x", "--no-install", "vite", ...args], {
    cwd: directory,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await child.exited)
    throw new Error(`Website build failed: ${args.join(" ")}`);
}
const { renderPage } = await import(
  pathToFileURL(resolve(directory, ".ssr/entry-server.js")).href
);
const template = await Bun.file(resolve(directory, "dist/index.html")).text();
const pages = [
  {
    path: "/",
    title: "OpenEval — Write the task. Judge the evidence.",
    description:
      "Write agent evaluations as a prompt and a rubric. Run isolated agents, inspect recorded evidence, and compare model scores with OpenEval.",
  },
  ...docs.map((doc) => ({
    path: docHref(doc.slug),
    title: `${doc.title} — OpenEval`,
    description: doc.description,
  })),
  {
    path: "/404.html",
    title: "Page not found — OpenEval",
    description: "OpenEval documentation for eval authors.",
  },
];
const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
for (const page of pages) {
  const rendered = renderPage(page.path);
  const head = `<link rel="canonical" href="${SITE}${page.path}"><meta property="og:type" content="website"><meta property="og:title" content="${escape(page.title)}"><meta property="og:description" content="${escape(page.description)}"><meta property="og:url" content="${SITE}${page.path}"><meta property="og:image" content="${SITE}/images/results.png"><meta name="twitter:card" content="summary_large_image">`;
  const html = template
    .replace(/<title>.*?<\/title>/, `<title>${page.title}</title>`)
    .replace(
      /<meta name="description" content="[^"]*"\s*\/>/,
      `<meta name="description" content="${escape(page.description)}" />`,
    )
    .replace("<!--page-head-->", head)
    .replace("<!--hydration-->", rendered.hydration)
    .replace("<!--app-html-->", rendered.html);
  const path =
    page.path === "/404.html"
      ? resolve(directory, "dist/404.html")
      : resolve(directory, "dist", page.path.slice(1), "index.html");
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, html);
}
await writeFile(
  resolve(directory, "dist/robots.txt"),
  `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`,
);
await writeFile(
  resolve(directory, "dist/sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages
    .filter((p) => p.path !== "/404.html")
    .map((p) => `<url><loc>${SITE}${p.path}</loc></url>`)
    .join("")}</urlset>`,
);
await writeFile(
  resolve(directory, "dist/_headers"),
  "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n",
);
console.log(`Prerendered ${pages.length} pages for ${SITE}`);
