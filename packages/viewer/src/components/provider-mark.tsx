import { createEffect } from "solid-js";
import { render } from "solid-js/web";
import { ProviderIcon } from "@opencode/ui/provider-icon";
import { iconNames } from "@opencode/ui/icons/provider";

const SVG = "http://www.w3.org/2000/svg";
const PREFIX = "openeval-provider-";
let sprite: Promise<Document> | undefined;
let host: SVGSVGElement | undefined;
const copied = new Set<string>();

/** Known provider artwork, or the shared fallback mark. */
export const providerIconId = (id: string) =>
  (iconNames as readonly string[]).includes(id) ? id : "synthetic";

/** The published sprite, fetched once per page. ProviderIcon knows its hashed URL. */
export function providerSprite() {
  sprite ??= (async () => {
    const probe = document.createElement("div");
    const dispose = render(() => <ProviderIcon id="synthetic" />, probe);
    const url = new URL(
      probe.querySelector("use")?.getAttribute("href") ?? "",
      location.href,
    );
    dispose();
    url.hash = "";
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not load model icons");
    return new DOMParser().parseFromString(
      await response.text(),
      "image/svg+xml",
    );
  })();
  sprite.catch(() => (sprite = undefined));
  return sprite;
}

/** Copy a symbol once into one hidden inline sprite that every mark references. */
async function include(id: string) {
  if (copied.has(id)) return;
  copied.add(id);
  try {
    const symbol = (await providerSprite()).getElementById(id);
    if (!symbol) return;
    if (!host) {
      host = document.createElementNS(SVG, "svg");
      host.setAttribute("aria-hidden", "true");
      host.setAttribute("width", "0");
      host.setAttribute("height", "0");
      // Not display:none, which drops gradients inside referenced symbols.
      host.style.position = "absolute";
      host.style.overflow = "hidden";
      document.body.prepend(host);
    }
    const copy = document.importNode(symbol, true) as Element;
    copy.id = PREFIX + id;
    host.append(copy);
  } catch {
    copied.delete(id);
  }
}

/** A provider icon that references in-page artwork, so re-rendered rows paint immediately. */
export function ProviderMark(props: { id: string }) {
  const id = () => providerIconId(props.id);
  createEffect(() => void include(id()));
  return (
    <svg data-component="provider-icon" aria-hidden="true">
      <use href={`#${PREFIX}${id()}`} />
    </svg>
  );
}
