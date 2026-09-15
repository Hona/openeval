/** OpenCode includes Markdown even in HTML requests; respect its quality values. */
export function prefersMarkdown(accept: string | null): boolean {
  const ranges = (accept ?? "")
    .toLowerCase()
    .split(",")
    .map((entry) => {
      const [type, ...parameters] = entry.trim().split(";");
      const parameter = parameters.find((value) =>
        value.trim().startsWith("q="),
      );
      const value =
        parameter === undefined ? 1 : Number(parameter.trim().slice(2));
      const quality =
        Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
      return { type: type.trim(), quality };
    });
  const exact = (type: string) => {
    const matches = ranges.filter((range) => range.type === type);
    return matches.length
      ? Math.max(...matches.map((range) => range.quality))
      : undefined;
  };
  const markdown = Math.max(
    exact("text/markdown") ?? 0,
    exact("text/x-markdown") ?? 0,
  );
  const html = exact("text/html") ?? exact("text/*") ?? exact("*/*") ?? 0;
  return markdown > 0 && markdown >= html;
}

export function markdownForPage(path: string, pages: Record<string, string>) {
  const canonical = path.replace(/\/index\.html$/, "/").replace(/\/?$/, "/");
  return pages[canonical];
}

export const documentationLinks = (markdown: string) =>
  `<${markdown}>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"`;

export async function serveDocumentation(
  request: Request,
  assets: { fetch(request: Request): Promise<Response> },
  pages: Record<string, string>,
) {
  const url = new URL(request.url);
  const markdown = markdownForPage(url.pathname, pages);
  if (!markdown || !["GET", "HEAD"].includes(request.method))
    return assets.fetch(request);
  const negotiated = prefersMarkdown(request.headers.get("Accept"));
  if (negotiated) url.pathname = markdown;
  const response = await assets.fetch(
    negotiated ? new Request(url, request) : request,
  );
  const headers = new Headers(response.headers);
  const vary = headers.get("Vary");
  if (
    !vary
      ?.split(",")
      .some((value) => ["accept", "*"].includes(value.trim().toLowerCase()))
  )
    headers.set("Vary", vary ? `${vary}, Accept` : "Accept");
  headers.set("Link", documentationLinks(markdown));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (negotiated && (response.ok || response.status === 304)) {
    headers.set("Content-Type", "text/markdown; charset=utf-8");
    headers.set("Content-Location", markdown);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
