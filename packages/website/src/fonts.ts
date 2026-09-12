/** Use OC-2 fonts only if both are ready before the first text paint.
 * A slow font download must not rewrap an already-readable document, including
 * below-the-fold sections that font-display: optional can still reformat.
 * Kept self-contained so the static build can run it before the body is parsed.
 */
export function selectFontsBeforePaint() {
  const root = document.documentElement;
  if (root.hasAttribute("data-site-fonts")) return;
  root.setAttribute("data-site-fonts", "fallback");
  const key = "openeval-font-mode";
  const navigation = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  const remember = (mode: string) => {
    try {
      sessionStorage.setItem(key, mode);
    } catch {
      /* Storage can be disabled. */
    }
  };
  // A slow first visit must not change the shared chrome on the next docs link.
  // An explicit reload can opt into the now-cached theme fonts.
  try {
    if (
      navigation?.type !== "reload" &&
      sessionStorage.getItem(key) === "fallback"
    )
      return;
  } catch {
    /* The per-document first-paint rule still applies. */
  }
  let painted =
    performance.getEntriesByName("first-contentful-paint").length > 0;
  requestAnimationFrame(() => {
    painted = true;
    remember(root.getAttribute("data-site-fonts")!);
  });
  Promise.all([
    document.fonts.load("400 13px Inter"),
    document.fonts.load('400 11px "JetBrains Mono"'),
  ])
    .then(([sans, mono]) => {
      if (!painted && sans.length && mono.length) {
        root.setAttribute("data-site-fonts", "theme");
        remember("theme");
      }
    })
    .catch(() => {
      /* Readable fallback fonts are already selected. */
    });
}
