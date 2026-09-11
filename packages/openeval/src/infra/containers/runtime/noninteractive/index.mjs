import { Plugin } from "@opencode/plugin/effect";

export default Plugin.define({
  id: "noninteractive",
  effect: (context) =>
    context.tool.transform((tools) => tools.remove("question")),
});
