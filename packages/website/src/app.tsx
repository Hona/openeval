import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { ThemeProvider, useTheme } from "@opencode/ui/theme/context";
import { Button } from "@opencode/ui/button";
import { Badge } from "@opencode/ui/badge";
import { Icon } from "@opencode/ui/icon";
import { IconButton } from "@opencode/ui/icon-button";
import { TextInput } from "@opencode/ui/text-input";
import { Tabs } from "@opencode/ui/tabs";
import { docs, docHref, findDoc, searchDocs, type Doc } from "./content";
import { GITHUB, VERSION } from "./examples";
import {
  CodeBlock,
  DataTable,
  Flow,
  InstallCommand,
  RenderBlock,
  Screenshot,
  StableTabPanel,
  Workbench,
} from "./components";

const groups = ["Start", "Author", "Run & inspect", "Reference"];

function App(props: { path: string }) {
  const theme = useTheme();
  const doc = () => findDoc(props.path);
  const home = () => props.path === "/";
  const [menu, setMenu] = createSignal(false);
  const [search, setSearch] = createSignal("");
  const [gallery, setGallery] = createSignal("results");
  const matches = createMemo(() => searchDocs(search()));
  let searchDialog!: HTMLDialogElement;
  const openSearch = () => {
    setSearch("");
    searchDialog.showModal();
    searchDialog.querySelector("input")?.focus();
  };
  onMount(() => {
    document.title = doc()
      ? `${doc()!.title} — OpenEval`
      : home()
        ? "OpenEval — Write the task. Judge the evidence."
        : "Page not found — OpenEval";
    theme.setTheme("oc-2");
    theme.setColorScheme("dark");
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", keyboard);
    onCleanup(() => window.removeEventListener("keydown", keyboard));
  });
  const nav = () => (
    <>
      <a
        class="sidebar-home"
        classList={{ active: home() }}
        href="/"
        aria-current={home() ? "page" : undefined}
      >
        <Icon name="flask" />
        Overview
      </a>
      <For each={groups}>
        {(group) => (
          <div class="nav-group">
            <span class="nav-group-label">{group}</span>
            <For each={docs.filter((d) => d.group === group)}>
              {(page) => (
                <a
                  href={docHref(page.slug)}
                  classList={{ active: page.slug === doc()?.slug }}
                  aria-current={page.slug === doc()?.slug ? "page" : undefined}
                >
                  <Icon name="code" />
                  <span>{page.title}</span>
                </a>
              )}
            </For>
          </div>
        )}
      </For>
    </>
  );
  return (
    <div class="site-shell">
      <a class="skip-link" href="#content">
        Skip to content
      </a>
      <header class="site-titlebar">
        <div class="brand">
          <IconButton
            class="mobile-toggle"
            size="small"
            variant="ghost-muted"
            aria-label={menu() ? "Close navigation" : "Open navigation"}
            aria-expanded={menu()}
            onClick={() => setMenu(!menu())}
            icon={<Icon name="menu" />}
          />
          <a href="/" aria-label="OpenEval home">
            <Icon name="flask" />
            <strong>OpenEval</strong>
          </a>
          <span class="titlebar-divider" />
          <span class="titlebar-section">
            {home() ? "Eval workbench" : "Documentation"}
          </span>
        </div>
        <div class="titlebar-actions">
          <Button
            size="small"
            variant="ghost-muted"
            class="search-trigger"
            onClick={openSearch}
          >
            <Icon name="magnifying-glass" />
            <span>Find a page…</span>
            <kbd>⌘ K</kbd>
          </Button>
          <a href={GITHUB} class="github-link" target="_blank" rel="noreferrer">
            <Icon name="branch" />
            <span>GitHub</span>
            <Icon name="arrow-up-right" />
          </a>
        </div>
      </header>
      <aside class="site-sidebar" classList={{ "is-open": menu() }}>
        <div class="workspace-label">
          <span class="status-dot" />
          <strong>openev.al</strong>
          <Badge>v{VERSION}</Badge>
        </div>
        <nav aria-label="Documentation">{nav()}</nav>
        <div class="sidebar-bottom">
          <a href="/starter.zip" download="openeval-starter.zip">
            <Icon name="download" />
            Download SQL starter
          </a>
          <a href={`${GITHUB}/issues`} target="_blank" rel="noreferrer">
            <Icon name="help" />
            Questions & feedback
            <Icon name="arrow-up-right" />
          </a>
          <span>Open source · MIT</span>
        </div>
      </aside>
      <Show when={menu()}>
        <button
          class="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      </Show>
      <main id="content" class="site-main" tabIndex={-1}>
        <Show
          when={home()}
          fallback={
            <Show
              when={doc()}
              fallback={
                <div class="not-found">
                  <Badge>404</Badge>
                  <h1>That page isn't in the workspace.</h1>
                  <p>
                    Find an authoring guide in the sidebar, or start with your
                    first eval.
                  </p>
                  <a class="text-link" href="/docs/quickstart/">
                    Open the quickstart <Icon name="arrow-right" />
                  </a>
                </div>
              }
            >
              {(page) => <DocPage doc={page()} />}
            </Show>
          }
        >
          <div class="landing">
            <div class="breadcrumb">
              <Icon name="folder" />
              <span>workspace</span>
              <Icon name="chevron-right" />
              <span>overview</span>
            </div>
            <section class="landing-intro">
              <div>
                <span class="eyebrow">FOR PEOPLE WHO WRITE EVALS</span>
                <h1>
                  Write the task.
                  <br />
                  <span>Judge the evidence.</span>
                </h1>
                <p>
                  A prompt, a rubric, and a real agent run.
                  <br />
                  Measure the behavior you care about. See why it passed.
                </p>
                <div class="intro-actions">
                  <a class="action-link primary" href="/docs/quickstart/">
                    Write your first eval <Icon name="arrow-right" />
                  </a>
                  <a
                    class="action-link"
                    href="/starter.zip"
                    download="openeval-starter.zip"
                  >
                    <Icon name="download" />
                    SQL starter
                  </a>
                </div>
              </div>
              <div class="intro-reference">
                <InstallCommand />
                <div class="intro-contract">
                  <span>
                    <Icon name="code" />
                    <code>prompt.md</code> task
                  </span>
                  <span>
                    <Icon name="shield" />
                    <code>judge.md</code> criteria
                  </span>
                  <span>
                    <Icon name="check" />
                    <code>0 | 1 | null</code> decisions
                  </span>
                </div>
                <a href="/docs/reference/">
                  Bun + Docker + your OpenCode models{" "}
                  <Icon name="arrow-up-right" />
                </a>
              </div>
            </section>
            <Workbench />
            <div class="landing-grid">
              <section>
                <h2>
                  <Icon name="folder" />
                  Your evals are files
                </h2>
                <DataTable
                  columns={["File", "What you write"]}
                  rows={[
                    ["prompt.md", "A natural, focused task"],
                    ["judge.md", "Named metrics and clear criteria"],
                    ["eval.ts", "Optional workspace and early stop"],
                  ]}
                />
                <a class="text-link" href="/docs/prompts/">
                  The authoring contract <Icon name="arrow-right" />
                </a>
              </section>
              <section>
                <h2>
                  <Icon name="branch" />
                  Every score has a trail
                </h2>
                <Flow steps={["Task", "Recording", "Judgment", "Score"]} />
                <ul class="compact-list">
                  <li>
                    <Icon name="check" />
                    Inspect tool calls and workspace artifacts
                  </li>
                  <li>
                    <Icon name="check" />
                    Follow each decision to its evidence
                  </li>
                  <li>
                    <Icon name="check" />
                    Rejudge without rerunning the candidate
                  </li>
                </ul>
                <a class="text-link" href="/docs/evidence/">
                  Read a judgment <Icon name="arrow-right" />
                </a>
              </section>
            </div>
            <section class="viewer-section">
              <div class="section-title">
                <div>
                  <span class="eyebrow">THE RESULTS WORKSPACE</span>
                  <h2>Compare. Drill down. Inspect.</h2>
                </div>
                <a class="text-link" href="/docs/scoring/">
                  How scores work <Icon name="arrow-right" />
                </a>
              </div>
              <Tabs variant="pill" value={gallery()} onChange={setGallery}>
                <Tabs.List aria-label="Viewer screenshots">
                  <Tabs.Trigger value="results">Model scores</Tabs.Trigger>
                  <Tabs.Trigger value="judgment">
                    Judgment & evidence
                  </Tabs.Trigger>
                  <Tabs.Trigger value="queue">Live queue</Tabs.Trigger>
                </Tabs.List>
                <div class="stable-tabs-panels screenshot-panels">
                  <StableTabPanel value="results" selected={gallery()}>
                    <Screenshot
                      image="results.png"
                      eager
                      alt="OpenEval results viewer with per-model scores and run costs"
                      caption="One score per model, with metrics available in the eval drilldown. Illustrative data."
                    />
                  </StableTabPanel>
                  <StableTabPanel value="judgment" selected={gallery()}>
                    <Screenshot
                      image="judgment.png"
                      eager
                      alt="Judge inspector showing metric decisions and evidence citations"
                      caption="Read the candidate and judge sessions side by side with metric decisions. Illustrative data."
                    />
                  </StableTabPanel>
                  <StableTabPanel value="queue" selected={gallery()}>
                    <Screenshot
                      image="queue.png"
                      eager
                      alt="Live queue with separate candidate and judge stages"
                      caption="Follow execution, judging, worker use, and estimated completion. Illustrative data."
                    />
                  </StableTabPanel>
                </div>
              </Tabs>
            </section>
            <section class="quick-reference">
              <div>
                <h2>Run a small batch first.</h2>
                <p>
                  Keep the full aggregate. Execute only the evals, models, and
                  repetitions you select.
                </p>
                <a class="text-link" href="/docs/running/">
                  Plan and resume work <Icon name="arrow-right" />
                </a>
              </div>
              <CodeBlock
                file="terminal"
                language="shell"
                code={`bunx --bun @hona/openeval plan --only-eval ask-dialect\nbunx --bun @hona/openeval run --only-repetition 1\nbunx --bun @hona/openeval view`}
              />
            </section>
          </div>
        </Show>
      </main>
      <dialog
        ref={searchDialog}
        class="search-dialog"
        aria-labelledby="search-title"
        onClick={(event) => {
          if (event.target === searchDialog) searchDialog.close();
        }}
      >
        <div class="search-dialog-heading">
          <strong id="search-title">Find in documentation</strong>
          <IconButton
            size="small"
            variant="ghost-muted"
            aria-label="Close search"
            onClick={() => searchDialog.close()}
            icon={<Icon name="close" />}
          />
        </div>
        <TextInput
          autofocus
          aria-label="Search documentation"
          placeholder="Search prompts, rubrics, workspaces…"
          value={search()}
          onInput={(event) => setSearch(event.currentTarget.value)}
        />
        <div class="search-results">
          <Show
            when={matches().length}
            fallback={
              <p>No matching pages. Try “rubric”, “budget”, or “evidence”.</p>
            }
          >
            <For each={matches()}>
              {(match) => (
                <a href={`${docHref(match.doc.slug)}#${match.section.id}`}>
                  <Icon name="code" />
                  <span>
                    <strong>{match.section.title}</strong>
                    <small>{match.doc.title}</small>
                  </span>
                  <Icon name="arrow-right" />
                </a>
              )}
            </For>
          </Show>
        </div>
        <div class="search-dialog-footer">
          <kbd>Tab</kbd> move <kbd>Enter</kbd> open <kbd>Esc</kbd> close
        </div>
      </dialog>
    </div>
  );
}

function DocPage(props: { doc: Doc }) {
  const index = () => docs.findIndex((d) => d.slug === props.doc.slug);
  return (
    <div class="docs-layout">
      <article class="doc-page">
        <div class="breadcrumb">
          <a href="/">OpenEval</a>
          <Icon name="chevron-right" />
          <span>{props.doc.group}</span>
          <Icon name="chevron-right" />
          <span>{props.doc.title}</span>
        </div>
        <header class="doc-heading">
          <span class="eyebrow">{props.doc.group.toUpperCase()}</span>
          <h1>{props.doc.title}</h1>
          <p>{props.doc.description}</p>
        </header>
        <For each={props.doc.sections}>
          {(section) => (
            <section id={section.id} class="doc-section">
              <h2>
                <a href={`#${section.id}`}>
                  {section.title}
                  <span aria-hidden="true">#</span>
                </a>
              </h2>
              <For each={section.blocks}>
                {(block) => <RenderBlock block={block} />}
              </For>
            </section>
          )}
        </For>
        <nav
          class="doc-pagination"
          aria-label="Previous and next documentation pages"
        >
          <Show
            when={docs[index() - 1]}
            fallback={
              <a href="/">
                <small>Back to</small>
                <strong>Overview</strong>
              </a>
            }
          >
            {(previous) => (
              <a href={docHref(previous().slug)}>
                <small>Previous</small>
                <strong>
                  <Icon name="arrow-left" />
                  {previous().title}
                </strong>
              </a>
            )}
          </Show>
          <Show when={docs[index() + 1]}>
            {(next) => (
              <a href={docHref(next().slug)}>
                <small>Next</small>
                <strong>
                  {next().title}
                  <Icon name="arrow-right" />
                </strong>
              </a>
            )}
          </Show>
        </nav>
      </article>
      <aside class="doc-outline">
        <span class="nav-group-label">ON THIS PAGE</span>
        <nav aria-label="On this page">
          <For each={props.doc.sections}>
            {(section) => <a href={`#${section.id}`}>{section.title}</a>}
          </For>
        </nav>
        <div class="outline-reference">
          <Icon name="code" />
          <strong>Start with the files.</strong>
          <p>Download the SQL example and adapt its prompt and rubric.</p>
          <a href="/starter.zip" download="openeval-starter.zip">
            Download starter <Icon name="download" />
          </a>
        </div>
      </aside>
    </div>
  );
}

export function Site(props: { path: string }) {
  return (
    <ThemeProvider defaultTheme="oc-2">
      <App path={props.path} />
    </ThemeProvider>
  );
}
