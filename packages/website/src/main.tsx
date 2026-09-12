import { hydrate, render } from "solid-js/web";
import "@opencode/ui/styles/tailwind";
import "@opencode/ui/styles/tokens";
import "./styles.css";
import { Site } from "./app";
import { selectFontsBeforePaint } from "./fonts";

selectFontsBeforePaint();
const root = document.getElementById("root")!;
const mount = () => <Site path={window.location.pathname} />;
if (root.querySelector("[data-hk]")) hydrate(mount, root);
else render(mount, root);
