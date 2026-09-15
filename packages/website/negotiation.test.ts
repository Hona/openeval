import { expect, test } from "bun:test";
import { prefersMarkdown, serveDocumentation } from "./negotiation";

// Accept values verified in the released @opencode/core 2.0.3 webfetch tool.
const opencode = {
  markdown:
    "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1",
  text: "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1",
  html: "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1",
};

test.each([
  [opencode.markdown, true],
  [opencode.text, true],
  [opencode.html, false],
  ["text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", false],
  ["text/markdown", true],
  ["text/x-markdown", true],
  ["text/markdown, */*", true],
  ["text/markdown;q=0, text/html", false],
  ["text/markdown;q=0.8, text/html;q=0.9", false],
  ["text/markdown;q=0.8, text/html;q=0, */*;q=1", true],
  ["text/markdown;q=0, text/x-markdown;q=1", true],
  ["TEXT/MARKDOWN; charset=utf-8; Q=1", true],
  ["text/markdown;q=invalid", false],
  ["text/markdown;q=2", false],
  ["text/*", false],
  ["*/*", false],
  [null, false],
] as const)("negotiates %s as Markdown: %s", (accept, expected) => {
  expect(prefersMarkdown(accept)).toBe(expected);
});

const pages = {
  "/": "/index.md",
  "/docs/quickstart/": "/docs/quickstart/index.md",
};

test("HTML and Markdown use separate static assets and cache validators", async () => {
  const requests: Request[] = [];
  const assets = {
    async fetch(request: Request) {
      requests.push(request);
      const markdown = new URL(request.url).pathname.endsWith(".md");
      return new Response(
        markdown
          ? "# Your first eval"
          : "<!doctype html><h1>Your first eval</h1>",
        {
          headers: {
            "Content-Type": markdown ? "text/markdown" : "text/html",
            ETag: markdown ? '"markdown"' : '"html"',
            Vary: "Accept-Encoding",
            "Cache-Control": "public, max-age=0, must-revalidate",
          },
        },
      );
    },
  };
  for (const format of ["markdown", "html"] as const) {
    const response = await serveDocumentation(
      new Request("https://openev.al/docs/quickstart/?source=copy", {
        headers: { Accept: opencode[format] },
      }),
      assets,
      pages,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toStartWith(`text/${format}`);
    expect(response.headers.get("ETag")).toBe(`"${format}"`);
    expect(response.headers.get("Vary")).toBe("Accept-Encoding, Accept");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=0, must-revalidate",
    );
    expect(response.headers.get("Content-Location")).toBe(
      format === "markdown" ? "/docs/quickstart/index.md" : null,
    );
    expect(response.headers.get("Link")).toContain(
      '/llms.txt>; rel="describedby"',
    );
    expect(await response.text()).toContain(
      format === "markdown" ? "# Your first eval" : "<h1>",
    );
  }
  expect(requests.map((request) => request.url)).toEqual([
    "https://openev.al/docs/quickstart/index.md?source=copy",
    "https://openev.al/docs/quickstart/?source=copy",
  ]);
});

test("negotiates canonical aliases and preserves HEAD and conditional responses", async () => {
  for (const path of [
    "/docs/quickstart",
    "/docs/quickstart/",
    "/docs/quickstart/index.html",
    "/",
    "/index.html",
  ]) {
    let target: Request | undefined;
    const response = await serveDocumentation(
      new Request(`https://openev.al${path}`, {
        method: "HEAD",
        headers: { Accept: opencode.markdown, "If-None-Match": '"same"' },
      }),
      {
        async fetch(request) {
          target = request;
          return new Response(null, {
            status: 304,
            headers: { ETag: '"same"', Vary: "accept" },
          });
        },
      },
      pages,
    );
    expect(target!.method).toBe("HEAD");
    expect(target!.headers.get("If-None-Match")).toBe('"same"');
    expect(new URL(target!.url).pathname).toBe(
      path.startsWith("/docs/") ? "/docs/quickstart/index.md" : "/index.md",
    );
    expect(response.status).toBe(304);
    expect(response.headers.get("Vary")).toBe("accept");
    expect(await response.text()).toBe("");
  }
});

test("unknown pages, explicit files, and non-reading methods pass through", async () => {
  for (const [path, method] of [
    ["/docs/missing/", "GET"],
    ["/docs/quickstart/index.md", "GET"],
    ["/docs/quickstart/", "POST"],
  ]) {
    const original = new Request(`https://openev.al${path}`, {
      method,
      headers: { Accept: opencode.markdown },
    });
    const expected = new Response("Not found", { status: 404 });
    const response = await serveDocumentation(
      original,
      {
        async fetch(request) {
          expect(request).toBe(original);
          return expected;
        },
      },
      pages,
    );
    expect(response).toBe(expected);
  }
});
