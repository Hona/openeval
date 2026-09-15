import { serveDocumentation } from "./negotiation";

declare const __MARKDOWN_PAGES__: Record<string, string>;

export default {
  fetch(
    request: Request,
    env: { ASSETS: { fetch(request: Request): Promise<Response> } },
  ) {
    return serveDocumentation(request, env.ASSETS, __MARKDOWN_PAGES__);
  },
};
