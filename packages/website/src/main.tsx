import { hydrate, render } from "solid-js/web";
import "@opencode/ui/styles/tailwind";
import "@opencode/ui/styles/tokens";
import "./styles.css";
import { Site } from "./app";
import { selectFontsBeforePaint } from "./fonts";
import { createRouter } from "./router";

selectFontsBeforePaint();
const root = document.getElementById("root")!;
const path = createRouter();
const mount = () => <Site path={path()} />;
if (root.querySelector("[data-hk]")) hydrate(mount, root);
else render(mount, root);
