import {
  createEffect,
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
import {
  docs,
  docHref,
  findDoc,
  overview,
  searchDocs,
  type Doc,
} from "./content";
import { GITHUB, VERSION } from "./examples";
import { RenderBlock } from "./components";
import { Landing } from "./landing";

const groups = ["Start", "Author", "Run & inspect", "Reference"];

function App(props: { path: string }) {
  const theme = useTheme();
  const doc = () => findDoc(props.path);
  const home = () => props.path === "/";
  const [menu, setMenu] = createSignal(false);
  const [search, setSearch] = createSignal("");
  const matches = createMemo(() => searchDocs(search()));
  let searchDialog!: HTMLDialogElement;
  const closeMenu = () => {
    setMenu(false);
    document
      .querySelector<HTMLButtonElement>(".mobile-toggle")
      ?.focus({ preventScroll: true });
  };
  const toggleMenu = () => {
    if (menu()) return closeMenu();
    setMenu(true);
    queueMicrotask(() =>
      document
        .querySelector<HTMLAnchorElement>("#docs-navigation nav a")
        ?.focus({ preventScroll: true }),
    );
  };
  const openSearch = () => {
    setMenu(false);
    setSearch("");
    searchDialog.showModal();
    searchDialog.querySelector("input")?.focus();
  };
  createEffect(() => {
    document.title = doc()
      ? `OpenEval | ${doc()!.title}`
      : home()
        ? `OpenEval | ${overview.title}`
        : "OpenEval | Page not found";
    setMenu(false);
    if (searchDialog.open) searchDialog.close();
  });
  onMount(() => {
    theme.setTheme("oc-2");
    theme.setColorScheme("dark");
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
      if (event.key === "Escape" && menu()) closeMenu();
    };
    window.addEventListener("keydown", keyboard);
    const mobile = window.matchMedia(
      "(max-width: 760px), (max-width: 1000px) and (pointer: coarse)",
    );
    const resized = () => {
      if (!mobile.matches) setMenu(false);
    };
    mobile.addEventListener("change", resized);
    onCleanup(() => {
      window.removeEventListener("keydown", keyboard);
      mobile.removeEventListener("change", resized);
    });
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
            aria-controls="docs-navigation"
            onClick={toggleMenu}
            icon={<Icon name="menu" />}
          />
          <a href="/" aria-label="OpenEval home">
            <Icon name="flask" />
            <strong>OpenEval</strong>
          </a>
          <Badge>v{VERSION}</Badge>
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
            aria-label="Search documentation"
            onClick={openSearch}
          >
            <Icon name="magnifying-glass" />
            <span>Find a page…</span>
            <kbd>⌘ K</kbd>
          </Button>
          <a
            href={GITHUB}
            class="github-link"
            target="_blank"
            rel="noreferrer"
            aria-label={`GitHub, ${__GITHUB_STARS__} stars`}
          >
            <Icon name="branch" />
            <span class="github-label">GitHub</span>
            <Badge aria-label={`${__GITHUB_STARS__} GitHub stars`}>
              <span aria-hidden="true">★</span>
              {__GITHUB_STARS__.toLocaleString("en-US")}
            </Badge>
            <Icon name="arrow-up-right" />
          </a>
        </div>
      </header>
      <aside
        id="docs-navigation"
        class="site-sidebar"
        classList={{ "is-open": menu() }}
      >
        <nav aria-label="Documentation">{nav()}</nav>
      </aside>
      <Show when={menu()}>
        <button
          class="mobile-backdrop"
          aria-label="Close navigation"
          onClick={closeMenu}
        />
      </Show>
      <main id="content" class="site-main" tabIndex={-1} inert={menu()}>
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
          <Landing />
        </Show>
      </main>
      <dialog
        ref={searchDialog}
        class="search-dialog"
        aria-labelledby="search-title"
        onClose={() =>
          document
            .querySelector<HTMLButtonElement>(".search-trigger")
            ?.focus({ preventScroll: true })
        }
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
  let outline!: HTMLDetailsElement;
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
        <details ref={outline} class="mobile-outline">
          <summary>
            <span>On this page</span>
            <Icon name="chevron-down" />
          </summary>
          <nav aria-label="Page sections">
            <For each={props.doc.sections}>
              {(section) => (
                <a
                  href={`#${section.id}`}
                  onClick={() => {
                    outline.open = false;
                  }}
                >
                  {section.title}
                  <Icon name="arrow-right" />
                </a>
              )}
            </For>
          </nav>
        </details>
        <For each={props.doc.sections}>
          {(section) => (
            <section class="doc-section" aria-labelledby={section.id}>
              <h2 id={section.id}>
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
