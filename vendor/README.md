# OpenCode session UI

`session-ui/` contains the desktop app's unpublished
`packages/session-ui`, pinned to commit
`22111e4b3bf461311f9204b653bab1faf6462321` in `anomalyco/opencode`.

The component implementation is upstream source. Packaging rewrites the monorepo's
`@opencode-ai/` imports to the published `@opencode/` npm namespace, resolves catalog
dependencies, and generates declaration files. The original MIT license and
source provenance are included alongside the source and declaration files.

It is a private development workspace. `bun install --frozen-lockfile` links it
through the package manager; no upstream checkout is required to build OpenEval.
Only the built viewer and license notices enter the published SDK archive.

The viewer uses the same timeline projection and row renderer as the desktop,
with its `compact` detail preset. The `data-workspace-session` attribute selects
the upstream solid-blue user-message appearance.
