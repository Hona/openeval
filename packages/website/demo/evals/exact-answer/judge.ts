import type { JudgeContext } from "@hona/openeval";

export default ({ response }: JudgeContext) => ({
  scores: { correct_answer: response.text === "APPLE" },
});
