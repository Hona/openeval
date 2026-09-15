import type { Benchmark } from "@hona/openeval";

export default {
  name: "OpenEval demo",
  models: [
    "opencode/gpt-6-astra#high",
    "opencode/claude-fable-5-1#high",
    "opencode/gemini-3.8-flash#high",
    "opencode-go/deepseek-v4.1-flash#high",
    "opencode/glm-5.3#high",
    "opencode/big-pickle",
  ],
  candidate: { websearch: false },
  judge: { model: "opencode/gpt-6-astra#high", websearch: false },
  repetitions: 3,
  concurrency: 2,
} satisfies Benchmark;
