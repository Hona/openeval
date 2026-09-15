import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";
import {
  documentationLinks,
  markdownForPage,
  prefersMarkdown,
} from "./negotiation";

type AgentModule = typeof import("./agent-files");

/** Load content through Vite's module graph so raw eval files also hot reload. */
export function agentDocumentation(): Plugin {
  function configure(
    server: ViteDevServer | PreviewServer,
    load: () => Promise<AgentModule>,
    preview = false,
  ) {
    server.middlewares.use(async (request, response, next) => {
      try {
        if (!["GET", "HEAD"].includes(request.method ?? "GET")) return next();
        const url = new URL(request.url ?? "/", "http://localhost");
        const path = url.pathname;
        if (url.searchParams.has("raw") || path.startsWith("/@")) return next();
        const demo = ["/demo", "/demo/", "/demo/index.html"].includes(path);
        if (
          !demo &&
          ![
            "/",
            "/index.html",
            "/llms.txt",
            "/skills/index.json",
            "/eval-writing.zip",
          ].includes(path) &&
          !path.startsWith("/docs/") &&
          !path.endsWith(".md")
        )
          return next();
        const { agentFiles, agentContentType, markdownPages } = await load();
        const markdown = markdownForPage(path, markdownPages);
        if (markdown) {
          response.setHeader("Vary", "Accept");
          response.setHeader("Link", documentationLinks(markdown));
          if (!prefersMarkdown(request.headers.accept ?? null)) {
            if (!preview && demo) {
              if (path === "/demo") {
                response.statusCode = 302;
                response.setHeader("Location", `/demo/${url.search}`);
                response.end();
                return;
              }
              response.setHeader("Content-Type", "text/html; charset=utf-8");
              const dev = server as ViteDevServer;
              const { demoHtml } = await dev.ssrLoadModule("/build-demo.ts");
              const source = await readFile(
                resolve(server.config.root, "../viewer/src/index.html"),
                "utf8",
              );
              const entry = `/@fs/${resolve(server.config.root, "../viewer/src/main.tsx").replaceAll("\\", "/")}`;
              response.end(
                await dev.transformIndexHtml(
                  path,
                  demoHtml(source).replace('src="/main.tsx"', `src="${entry}"`),
                ),
              );
              return;
            }
            return next();
          }
        }
        const files = await agentFiles();
        const target = markdown ?? path;
        if (!(target in files)) return next();
        const content = preview
          ? await readFile(
              resolve(
                server.config.root,
                server.config.build.outDir,
                target.slice(1),
              ),
            )
          : files[target];
        response.setHeader("Content-Type", agentContentType(target));
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader(
          "Link",
          markdown
            ? documentationLinks(markdown)
            : '</llms.txt>; rel="describedby"',
        );
        if (markdown) response.setHeader("Content-Location", markdown);
        response.end(request.method === "HEAD" ? undefined : content);
      } catch (error) {
        next(error);
      }
    });
  }
  return {
    name: "agent-documentation",
    configureServer: (server) =>
      configure(
        server,
        () => server.ssrLoadModule("/agent-files.ts") as Promise<AgentModule>,
      ),
    configurePreviewServer: (server) =>
      configure(
        server,
        () =>
          import(
            pathToFileURL(resolve(server.config.root, "agent-files.ts")).href
          ),
        true,
      ),
  };
}
