# openev.al

Static landing page and documentation for eval authors, built with Solid and the
same `@opencode/ui` components, OC-2 theme, and fonts as the results viewer.

| Command, from the repository root | Purpose |
| --- | --- |
| `bun run site:dev` | Hot reload at http://127.0.0.1:4176 |
| `bun run site:build` | Client build, SSR build, and static page generation |
| `bun run site:verify` | Verify pages, links, assets, and the downloadable starter |
| `bun run site:test` | Desktop, phone, tablet, and iPhone/WebKit reading and geometry checks |

Install the test browsers once with `bunx --no-install playwright install chromium webkit --only-shell`
from `packages/website`.

## Content

- `src/content.ts`: overview copy, documentation pages, code samples, tables, and navigation.
- `src/examples.ts`: agent setup prompt, example evals, package version, and downloadable starter.
- `src/app.tsx`: documentation shell and page navigation.
- `src/landing.tsx`: numbered Task, Judge, Run, Inspect, and Compare overview with the shared viewer chart.
- `demo/benchmark.ts`: typed model configuration used by the overview and displayed verbatim in Compare.
- `src/components.tsx`: copy controls, code blocks, documentation screenshots, and score explorer.
- `src/styles.css`: compact layouts using OC-2 theme tokens.
- `prepare.ts`: copy public screenshots and produce the starter ZIP.
- `build.ts`: prerender all routes, metadata, sitemap, and the 404 page.
- `github-stars.ts`: fetch the star count at build time; the header needs no browser API request.

Use [the canonical vocabulary](../../TERMINOLOGY.md) in every label, example,
caption, and authoring guide. Criteria are graded requirements; scores are
awarded credit; metrics are measurements. The terminology page is checked against
the root glossary during CI and `site:verify`. Runnable examples target 0.3.0
with `## Criterion:` headings and plain JudgeContext functions.

Pages contain readable HTML before JavaScript loads. JavaScript adds file tabs,
search, copy controls, and illustrative interactions; it never calls a live model.

## Visual stability

- Tab panels share a grid cell, so the longest variant reserves the space. Inactive panels are hidden and inert.
- The overview renders the interactive viewer chart. Documentation screenshot dimensions are checked against the PNG files during verification.
- Search keeps its outer bounds while only the result list changes. Score text has a reserved column.
- Theme fonts are preloaded and selected before first paint. A slow download keeps the fallback consistent across docs navigation; an explicit reload can use the warmed font cache.
- Browser checks compare protected element bounds on every animation frame. This catches click-triggered shifts that the CLS metric excludes.

## Responsive reading

- Phone and compact touch layouts use 16px reading text and search inputs, 14px code, and 44px minimum primary touch targets.
- Shared gutters align headings, panels, and actions. Safe-area insets protect the header and bottom controls on iPhones.
- Prompt and rubric prose wraps; wide reference tables and source code scroll inside their own panels.
- Mobile docs include a section outline, and screenshots have an explicit full-size action.
- Checks cover 320–430px phones, tablet portrait, and iPhone portrait/landscape in WebKit, alongside the desktop stability checks.

## Cloudflare Pages

The `openeval` Pages project is connected to `Hona/openeval`, production branch
`main`, and publishes to **https://openev.al** with these build settings:

| Setting | Value |
| --- | --- |
| Root directory | Repository root |
| Build command | `bun install --frozen-lockfile && bun run site:build && bun run site:verify` |
| Output directory | `packages/website/dist` |
| `BUN_VERSION` | `1.4.2` |
| `NODE_VERSION` | `24` |

GitHub pushes to `main` deploy through Pages' Git integration. The Pages subdomain
https://openeval.pages.dev serves the same production deployment.
The site is static: there are no Pages Functions or application secrets.

```mermaid
flowchart LR
  M["Push to main"] --> B["Build static pages"] --> V["Verify pages + starter"] --> P["Cloudflare Pages"]
```
