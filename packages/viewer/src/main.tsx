import { render } from "solid-js/web";
import { ThemeProvider } from "@opencode/ui/theme/context";
import { DialogProvider } from "@opencode/ui/context/dialog";
import "@opencode/ui/styles/tailwind";
import "@opencode/ui/styles/tokens";
import "@opencode/session-ui/styles";
import "./styles.css";
import { App } from "./app";
import { createViewerSource } from "./data-source";
import { ViewerProvider } from "./data/context";
import type { ViewerConfig } from "./data/types";

const settings = document.getElementById("openeval-source")?.textContent;
const config: ViewerConfig = settings ? JSON.parse(settings) : {};
const source = createViewerSource(config);

render(
  () => (
    <ThemeProvider defaultTheme="oc-2">
      <DialogProvider>
        <ViewerProvider source={source} config={config}>
          <App />
        </ViewerProvider>
      </DialogProvider>
    </ThemeProvider>
  ),
  document.getElementById("root")!,
);
