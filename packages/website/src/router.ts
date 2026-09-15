import { createSignal } from "solid-js";
import { findDoc } from "./content";

/** Same-document navigation for routes whose content already ships in the bundle. */
export const routable = (path: string) => path === "/" || !!findDoc(path);

export function createRouter() {
  const [path, setPath] = createSignal(location.pathname);
  const settle = (hash: string, focus: boolean) => {
    const target = hash ? document.getElementById(hash.slice(1)) : null;
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
    if (focus)
      document.getElementById("content")?.focus({ preventScroll: true });
  };
  document.addEventListener("click", (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const anchor = (event.target as Element).closest("a");
    if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin || !routable(url.pathname)) return;
    if (url.pathname === location.pathname && url.hash) return;
    event.preventDefault();
    history.pushState(null, "", url);
    setPath(location.pathname);
    settle(url.hash, true);
  });
  window.addEventListener("popstate", () => {
    setPath(location.pathname);
    if (location.hash) settle(location.hash, false);
  });
  return path;
}
