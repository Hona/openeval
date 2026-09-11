import { render } from "solid-js/web";
import { ThemeProvider } from "@opencode/ui/theme/context";
import { DialogProvider } from "@opencode/ui/context/dialog";
import "@opencode/ui/styles/tailwind";
import "@opencode/ui/styles/tokens";
import "@opencode/session-ui/styles";
import "./styles.css";
import { App } from "./app";

render(
  () => (
    <ThemeProvider defaultTheme="oc-2">
      <DialogProvider>
        <App />
      </DialogProvider>
    </ThemeProvider>
  ),
  document.getElementById("root")!,
);
