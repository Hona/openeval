import { createContext, useContext, type JSX } from "solid-js";
import type { ViewerConfig, ViewerDataSource } from "./types";

const Context = createContext<{
  source: ViewerDataSource;
  config: ViewerConfig;
}>();
export function ViewerProvider(props: {
  source: ViewerDataSource;
  config: ViewerConfig;
  children: JSX.Element;
}) {
  return (
    <Context.Provider value={{ source: props.source, config: props.config }}>
      {props.children}
    </Context.Provider>
  );
}
export function useViewer() {
  const context = useContext(Context);
  if (!context) throw new Error("ViewerProvider is required");
  return context;
}
