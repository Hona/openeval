import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";
import { agentContentType, agentFiles, markdownPages } from "./agent-files";
import {
  documentationLinks,
  markdownForPage,
  prefersMarkdown,
} from "./negotiation";

/** Use the production Markdown selection in the hot-reloading app and preview. */
export function agentDocumentation(): Plugin {
  function configure(server: ViteDevServer | PreviewServer, preview = false) {
    server.middlewares.use(async (request, response, next) => {
      try {
        if (!["GET", "HEAD"].includes(request.method ?? "GET")) return next();
        const path = new URL(request.url ?? "/", "http://localhost").pathname;
        const markdown = markdownForPage(path, markdownPages);
        if (markdown) {
          response.setHeader("Vary", "Accept");
          response.setHeader("Link", documentationLinks(markdown));
          if (!prefersMarkdown(request.headers.accept ?? null)) return next();
        } else if (
          !path.endsWith(".md") &&
          !["/llms.txt", "/skills/index.json", "/eval-writing.zip"].includes(
            path,
          )
        )
          return next();
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
    configureServer: (server) => configure(server),
    configurePreviewServer: (server) => configure(server, true),
  };
}
