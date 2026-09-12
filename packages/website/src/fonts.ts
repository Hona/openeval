/** Use OC-2 fonts only if both are ready before the first text paint.
 * A slow font download must not rewrap an already-readable document, including
 * below-the-fold sections that font-display: optional can still reformat.
 * Kept self-contained so the static build can run it before the body is parsed.
 */
export function selectFontsBeforePaint() {
  const root = document.documentElement;
  if (root.hasAttribute("data-site-fonts")) return;
  root.setAttribute("data-site-fonts", "fallback");
  const assets = [
    ...document.querySelectorAll('link[rel="preload"][as="font"]'),
  ]
    .map((link) => link.getAttribute("href"))
    .sort()
    .join(";");
  const key = `openeval-font-mode:${assets || "development"}`;
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
  // Keep the visit's font choice across docs links, including Safari's cached
  // font decoding. A new asset set or explicit reload can re-evaluate readiness.
  try {
    const saved = sessionStorage.getItem(key);
    if (
      navigation?.type !== "reload" &&
      (saved === "fallback" || saved === "theme")
    ) {
      root.setAttribute("data-site-fonts", saved);
      return;
    }
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
