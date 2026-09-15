# Releases

`@hona/openeval` publishes the Bun SDK, the generic `openeval` CLI, judge and
container assets, and the built viewer. The development viewer and vendored
session UI are private workspace packages; they are not separately published.

OpenEval's GitHub repository is public. npm receives only the SDK archive's
explicit file allowlist. This repository starts from an SDK-only root commit;
private benchmark content and its history belong to the separate private client repo.

## Verify and publish

1. Update the version in `packages/openeval/package.json`.
2. Run `bun install`, `bun run typecheck`, and `bun test`.
3. Run `bun run release:pack` and `bun run release:verify`.
4. Commit the release and push it.
5. For the first release, use `npm publish ./artifacts/hona-openeval-VERSION.tgz --access public`.
6. Tag the release `vVERSION`. Later tags use the publishing workflow.

`release:verify` installs the actual tarball in an independent consumer, checks
all public exports and TypeScript use, exercises the built viewer, checks CLI
help/version, and checks the package asset boundary. No live models are called.

## Trusted publishing

Version 0.3.0 uses the canonical criterion/score API and results schema 5.
Breaking pre-1.0 changes do not carry compatibility aliases or built-in store
migrations. Any author-approved migration of existing private runs is a separate
one-off operation that retains the original database and recorded evidence.

After the first publication, configure the npm package's trusted publisher:

- GitHub owner: `Hona`
- Repository: `openeval`
- Workflow: `publish.yml`
- Permit direct `npm publish`.

The workflow uses GitHub-hosted runners and OIDC rather than an npm token.
Provenance is enabled for future releases from this public repository. See
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers).

## Upstream session UI

OpenEval 0.3.1 uses production `@opencode/*` 2.0.3 dependencies in the SDK,
viewer, and candidate image. `@opencode/session-ui` is not published, so its
vendored source remains pinned while its published dependencies use 2.0.3.

`vendor/session-ui/upstream.json` records the upstream commit and namespace
rewrite used for the vendored UI. Source, declarations, and the original MIT
license are checked in so a checkout can build without a local upstream repo.
Vite includes dependency license notices in the distributed viewer.
