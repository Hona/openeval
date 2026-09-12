import { generateHydrationScript, renderToString } from "solid-js/web";
import { Site } from "./app";

export const renderPage = (path: string) => ({
  html: renderToString(() => <Site path={path} />),
  hydration: generateHydrationScript(),
});
