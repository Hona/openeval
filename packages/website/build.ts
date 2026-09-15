import { mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { docs, docHref, overview } from "./src/content";
import { SITE } from "./src/examples";
import { selectFontsBeforePaint } from "./src/fonts";
import { githubStarCount } from "./github-stars";
import { agentFiles, markdownPages } from "./agent-files";
import "./prepare";

const directory = fileURLToPath(new URL("./", import.meta.url));
const stars = await githubStarCount();
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
  const child = Bun.spawn(
    ["bun", "x", "--bun", "--no-install", "vite", ...args],
    {
      cwd: directory,
      env: { ...process.env, OPENEVAL_GITHUB_STARS: String(stars) },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  if (await child.exited)
    throw new Error(`Website build failed: ${args.join(" ")}`);
}
const { renderPage } = await import(
  pathToFileURL(resolve(directory, ".ssr/entry-server.js")).href
);
const template = await Bun.file(resolve(directory, "dist/index.html")).text();
const fonts = (await readdir(resolve(directory, "dist/assets"))).filter(
  (name) =>
    /^(Inter-.*\.ttf|JetBrainsMonoNerdFontMono-Regular-.*\.woff2)$/.test(name),
);
if (fonts.length !== 2)
  throw new Error("Expected the two OC-2 fonts for early preload");
const fontPreloads = fonts
  .map(
    (name) =>
      `<link rel="preload" href="/assets/${name}" as="font" type="font/${name.endsWith("woff2") ? "woff2" : "ttf"}" crossorigin>`,
  )
  .join("");
const pages = [
  {
    path: "/",
    title: `OpenEval | ${overview.title}`,
    description: overview.description,
  },
  ...docs.map((doc) => ({
    path: docHref(doc.slug),
    title: `OpenEval | ${doc.title}`,
    description: doc.description,
  })),
  {
    path: "/404.html",
    title: "OpenEval | Page not found",
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
  const alternate = markdownPages[page.path];
  const head = `${alternate ? `<link rel="alternate" type="text/markdown" href="${alternate}">` : ""}<link rel="canonical" href="${SITE}${page.path}"><meta property="og:type" content="website"><meta property="og:title" content="${escape(page.title)}"><meta property="og:description" content="${escape(page.description)}"><meta property="og:url" content="${SITE}${page.path}"><meta property="og:image" content="${SITE}/images/results.png"><meta name="twitter:card" content="summary_large_image">`;
  const html = template
    .replace(/<title>.*?<\/title>/, `<title>${page.title}</title>`)
    .replace(
      /<meta name="description" content="[^"]*"\s*\/>/,
      `<meta name="description" content="${escape(page.description)}" />`,
    )
    .replace("<!--page-head-->", fontPreloads + head)
    .replace(
      "</head>",
      `<script>(${selectFontsBeforePaint.toString()})()</script></head>`,
    )
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
  '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/*.md\n  Content-Type: text/markdown; charset=utf-8\n  Link: </llms.txt>; rel="describedby"\n/llms.txt\n  Content-Type: text/plain; charset=utf-8\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n',
);
for (const [path, content] of Object.entries(await agentFiles())) {
  const file = resolve(directory, "dist", path.slice(1));
  await mkdir(resolve(file, ".."), { recursive: true });
  await writeFile(file, content);
}
const worker = await Bun.build({
  entrypoints: [resolve(directory, "worker.ts")],
  outdir: resolve(directory, "dist"),
  naming: "_worker.js",
  target: "browser",
  minify: true,
  define: { __MARKDOWN_PAGES__: JSON.stringify(markdownPages) },
});
if (!worker.success)
  throw new AggregateError(worker.logs, "Documentation worker build failed");
await writeFile(
  resolve(directory, "dist/_routes.json"),
  JSON.stringify(
    {
      version: 1,
      include: ["/", "/index.html", "/docs/*"],
      exclude: ["/docs/*.md"],
    },
    null,
    2,
  ),
);
console.log(`Prerendered ${pages.length} pages for ${SITE}`);
