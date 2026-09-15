import {
  benchmark,
  codePrompt,
  codeJudge,
  codeBenchmark,
  hybridCode,
  preparation,
  prompt,
  rubric,
  runCommands,
} from "./examples";
import type { ScreenshotName } from "./media";

export const overview = {
  title: "Write your own eval in 30 seconds.",
  description:
    "Built on OpenCode. Out of the box support for all models, and consistent data from every run.",
};

export type Block =
  | { type: "text"; text: string }
  | { type: "code"; file: string; code: string; language?: string }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "note"; title: string; text: string }
  | { type: "flow"; steps: string[] }
  | { type: "image"; image: ScreenshotName; alt: string; caption: string }
  | { type: "calculator" };
export type Section = { id: string; title: string; blocks: Block[] };
export type Doc = {
  slug: string;
  title: string;
  group: "Start" | "Author" | "Run & inspect" | "Reference";
  description: string;
  sections: Section[];
};
const text = (text: string): Block => ({ type: "text", text });
const code = (file: string, code: string, language?: string): Block => ({
  type: "code",
  file,
  code,
  language,
});
const table = (columns: string[], rows: string[][]): Block => ({
  type: "table",
  columns,
  rows,
});
const note = (title: string, text: string): Block => ({
  type: "note",
  title,
  text,
});

export const docs: Doc[] = [
  {
    slug: "quickstart",
    title: "Your first eval",
    group: "Start",
    description: "From a task and a judge to a recorded, scored agent run.",
    sections: [
      {
        id: "files",
        title: "Start with two files",
        blocks: [
          code(
            "my-benchmark/",
            `benchmark.ts\nevals/\n  ask-dialect/\n    prompt.md    # the task\n    judge.md     # the criteria`,
            "text",
          ),
          code("evals/ask-dialect/prompt.md", prompt, "markdown"),
          code("evals/ask-dialect/judge.md", rubric, "markdown"),
          note(
            "Code works too",
            "A judge.ts function can replace judge.md or contribute additional criteria alongside it. Code-only benchmarks need no judge model. See Code & hybrid judges for the plain-function API.",
          ),
          note(
            "One recording, two checks",
            "The answer is graded separately for asking about the SQL dialect and using bound parameters. A question-only answer passes the first criterion and fails the second.",
          ),
        ],
      },
      {
        id: "setup",
        title: "Choose your models",
        blocks: [
          table(
            ["You need", "Why"],
            [
              ["Bun 1.4.2+", "Runs TypeScript declarations and the SDK"],
              ["Docker", "Provides isolated candidate workspaces"],
              [
                "OpenCode connections",
                "Supplies access to your candidate and judge models",
              ],
            ],
          ),
          code(
            "terminal · inside my-benchmark",
            "bun add --exact @hona/openeval",
            "shell",
          ),
          code("benchmark.ts", benchmark, "typescript"),
          text(
            "Replace both provider/model placeholders with models connected in your OpenCode installation. Choose a candidate to evaluate and a judge to read its recorded work.",
          ),
        ],
      },
      {
        id: "run",
        title: "Build. Plan. Run. Inspect.",
        blocks: [
          code("terminal", runCommands, "shell"),
          {
            type: "flow",
            steps: [
              "Build the image",
              "Inspect the plan",
              "Record the run",
              "Read the judgment",
            ],
          },
          table(
            ["Output", "Where to find it"],
            [
              ["Local viewer", "http://127.0.0.1:4173"],
              [
                "Run and evidence store",
                "results/ in your benchmark directory",
              ],
              [
                "Next invocation",
                "Resumes the same aggregate and reuses unchanged work",
              ],
            ],
          ),
        ],
      },
    ],
  },
  {
    slug: "terminology",
    title: "Concepts & terminology",
    group: "Start",
    description:
      "A metric measures what happened. A criterion defines what earns credit. A score is the credit awarded.",
    sections: [
      {
        id: "terms",
        title: "One vocabulary",
        blocks: [
          text(
            "A benchmark contains evals. Each eval defines a task and a rubric. Judges produce scores for the rubric's criteria. Runs also record metrics such as cost, tokens, and tool reliability.",
          ),
          table(
            ["Term", "Meaning", "Example"],
            [
              [
                "Benchmark",
                "A collection of evals and their run configuration.",
                "A set of agent tasks evaluated across models.",
              ],
              [
                "Eval",
                "A task, its input and environment, and its grading specification.",
                "Produce a parameterized SQL query.",
              ],
              [
                "Criterion",
                "A named requirement being graded. Plural: criteria.",
                "safe_parameters",
              ],
              [
                "Score",
                "Credit awarded to a criterion, normalized from 0 to 1, or an aggregate of that credit.",
                "1 for full credit; 0 for no credit.",
              ],
              [
                "Metric",
                "An observed or calculated measurement. It contributes to grading only when a criterion uses it.",
                "Cost in USD, token count, or tool error rate.",
              ],
              [
                "Rubric",
                "The criteria and rules for awarding scores.",
                "The conditions for accepting a parameterized query.",
              ],
              [
                "Judge",
                "An evaluator that applies grading rules using code, an LLM, or both.",
                "An LLM applying a written rubric.",
              ],
              [
                "Judgment",
                "A judge's output, including any named criterion scores and supporting data.",
                "A safe_parameters score with evidence.",
              ],
              [
                "BenchmarkRun",
                "A recorded benchmark collection with its inputs and selected results.",
                "One retained comparison across models.",
              ],
              [
                "EvalRun",
                "One candidate execution of an eval.",
                "A model's second repetition of the SQL task.",
              ],
              [
                "JudgeRun",
                "A grading execution against recorded evidence.",
                "A new judgment of a retained EvalRun.",
              ],
            ],
          ),
        ],
      },
      {
        id: "measurements-and-credit",
        title: "Measurements become credit through a rule",
        blocks: [
          table(
            ["Role", "Example", "Meaning"],
            [
              [
                "Metric",
                "cost_usd = 0.84",
                "An observed or calculated cost in USD.",
              ],
              [
                "Criterion",
                "within_budget",
                "Award full credit when cost_usd is at most 1.00.",
              ],
              [
                "Criterion score",
                "within_budget = 1",
                "Credit awarded by applying that rule.",
              ],
            ],
          ),
          text(
            "A tool error rate of 0.2 is a measurement even though it falls between 0 and 1. Recording a metric does not automatically award or deduct credit. The author decides whether a criterion uses it.",
          ),
          text(
            "Criterion IDs are author-defined. A name such as correct_answer has no built-in grading rule. A rubric explains how evidence becomes a score; a judgment records the result of applying it.",
          ),
          note(
            "Aggregation",
            "Average repetitions per criterion, average criteria within each eval, then average evals equally and multiply by 100. Required unresolved scores keep the final percentage unresolved. Category-specific views and unequal weights are future design work.",
          ),
        ],
      },
      {
        id: "recordings",
        title: "Definitions, executions, and evidence",
        blocks: [
          text(
            "An Eval is a reusable task definition; an EvalRun is one candidate execution. A JudgeRun applies grading rules to recorded evidence. A completed rejudge updates the active selection while retaining earlier judgments.",
          ),
          table(
            ["Term", "Use it for"],
            [
              [
                "Recording",
                "Retained messages, events, native session archives, and workspace artifacts, subject to recorded capture coverage.",
              ],
              ["Trace", "An ordered view of recorded model and tool activity."],
              [
                "Evidence",
                "Recorded material that supports a judgment; citations identify the relevant parts.",
              ],
            ],
          ),
        ],
      },
      {
        id: "contract",
        title: "One scoring contract",
        blocks: [
          table(
            ["Name", "Meaning"],
            [
              [
                "## Criterion: id — Label",
                "A criterion declaration in judge.md.",
              ],
              [
                "CriterionDefinition / rubricCriteria",
                "Criterion definitions and their Markdown parser.",
              ],
              [
                "CriterionScore / judgment.scores",
                "Normalized criterion scores, reasons, evidence, and source.",
              ],
              [
                "JudgeContext",
                "The data supplied to a plain judge.ts function.",
              ],
            ],
          ),
          code(
            "judge.md",
            "## Criterion: safe_parameters — Uses bound parameters",
            "markdown",
          ),
          text(
            "Judge is the common name for code-based, LLM-based, and hybrid evaluators. judge.md and judge.ts can both contribute distinct criteria to the same eval. Their scores have equal weight regardless of which file produced them.",
          ),
          text(
            "Scores accept booleans, finite numbers from 0 to 1, or null. Booleans become 0 or 1; null means unresolved. A code function can also return custom JSON. Only entries in scores contribute to grading; outputs without scores are unscored.",
          ),
          text(
            "OpenEval 0.3.0 uses the canonical API and results schema 5. Preserve historical quotations, source titles, original recordings, and finalized judgments when carrying out a separate migration of an older store.",
          ),
        ],
      },
    ],
  },
  {
    slug: "prompts",
    title: "Write task prompts",
    group: "Author",
    description:
      "Give the candidate a real task. Put the scoring rules in the rubric.",
    sections: [
      {
        id: "task",
        title: "Write what the user would ask",
        blocks: [
          code("prompt.md", prompt, "markdown"),
          table(
            ["Put in the prompt", "Put in judge.md"],
            [
              [
                "The user's goal and constraints",
                "What qualifies as pass or fail",
              ],
              [
                "Context the agent should have",
                "Domain facts used to check its answer",
              ],
              [
                "Requested output or deliverable",
                "Accepted alternatives and edge cases",
              ],
            ],
          ),
          text(
            "OpenEval sends prompt.md verbatim. If you want to measure whether an agent notices missing information, preserve that ambiguity in the task.",
          ),
        ],
      },
      {
        id: "context",
        title: "Make the starting conditions explicit",
        blocks: [
          code(
            "evals/query-from-schema/",
            `prompt.md\njudge.md\nworkspace/\n  schema.sql\n  README.md`,
            "text",
          ),
          code(
            "workspace/schema.sql",
            `CREATE TABLE orders (\n  id BIGINT PRIMARY KEY,\n  customer_id BIGINT NOT NULL,\n  created_at TIMESTAMP NOT NULL,\n  total DECIMAL(12, 2) NOT NULL\n);`,
            "sql",
          ),
          text(
            "Use workspace files for project context. Keep evaluator references and answer keys in judge.md, outside the candidate environment.",
          ),
        ],
      },
      {
        id: "review",
        title: "Review the behavior you are measuring",
        blocks: [
          table(
            ["Question", "Useful distinction"],
            [
              [
                "Is this a task or a grading hint?",
                "Ask for the outcome; let the candidate choose its method.",
              ],
              [
                "Would another valid workflow pass?",
                "Keep command choices out of the rubric unless they are the intended behavior.",
              ],
              [
                "What happens if it only asks a question?",
                "Make that outcome explicit in each criterion.",
              ],
              [
                "Is the task reproducible?",
                "Supply the starting files and pin external inputs.",
              ],
            ],
          ),
        ],
      },
    ],
  },
  {
    slug: "rubrics",
    title: "Write judge rubrics",
    group: "Author",
    description: "Small, independent decisions with evidence you can inspect.",
    sections: [
      {
        id: "criteria",
        title: "Declare each criterion",
        blocks: [
          code("judge.md", rubric, "markdown"),
          table(
            ["Part", "Contract"],
            [
              [
                "## Criterion: id — Label",
                "Declares a stable criterion ID and display label",
              ],
              [
                "Scoring rules",
                "State the observable behavior, including omissions",
              ],
              [
                "Domain references",
                "Supply version-correct facts and relevant sources",
              ],
              [
                "Multiple criteria",
                "All declared criteria are graded from the same recording",
              ],
            ],
          ),
        ],
      },
      {
        id: "outcomes",
        title: "Decide what counts",
        blocks: [
          table(
            ["SQL response", "Asks for dialect", "Bound parameters"],
            [
              [
                "Asks which DB; supplies a parameterized draft",
                "1 · pass",
                "1 · pass",
              ],
              [
                "Assumes PostgreSQL; supplies a bound $1 query",
                "0 · fail",
                "1 · pass",
              ],
              ["Only asks which database", "1 · pass", "0 · fail"],
              ["Recording is unavailable", "null · unknown", "null · unknown"],
            ],
          ),
          note(
            "Missing advice and missing evidence are different",
            "An observed omission can fail a criterion. If the necessary recording is unavailable, the judge can return null. An unresolved criterion score keeps the final benchmark percentage unresolved.",
          ),
        ],
      },
      {
        id: "shared-judge",
        title: "Let the shared judge handle mechanics",
        blocks: [
          {
            type: "flow",
            steps: [
              "Read the rubric",
              "Inspect the recording",
              "Cite evidence",
              "Submit every criterion score",
            ],
          },
          text(
            "The native openeval-judge agent supplies the common evidence, citation, and submission instructions. Your rubric supplies task-specific criteria. Structured tools validate the judge's submission and return errors for correction.",
          ),
          table(
            ["Author responsibility", "OpenEval responsibility"],
            [
              [
                "Define intended behavior",
                "Validate criterion IDs and normalized 0–1 or null scores",
              ],
              [
                "Accept equivalent correct approaches",
                "Validate citations against the recording",
              ],
              [
                "Explain borderline cases",
                "Keep recordings and judgments immutable",
              ],
              [
                "Calibrate your criteria",
                "Aggregate criterion scores consistently",
              ],
            ],
          ),
        ],
      },
    ],
  },
  {
    slug: "code-judges",
    title: "Code & hybrid judges",
    group: "Author",
    description:
      "Write an ordinary function. Read the recording. Return scores and your own data.",
    sections: [
      {
        id: "function",
        title: "A deterministic eval is a plain function",
        blocks: [
          code("evals/exact-answer/prompt.md", codePrompt, "markdown"),
          code("evals/exact-answer/judge.ts", codeJudge, "typescript"),
          code(
            "benchmark.ts · no judge model needed",
            codeBenchmark,
            "typescript",
          ),
          text(
            "The runner discovers judge.ts by convention. It receives JudgeContext and returns JSON, synchronously or asynchronously. response.text is always a string; missing text becomes an empty string. The execution outcome remains available on context.run.",
          ),
          table(
            ["Returned value in scores", "Normalized credit"],
            [
              ["true / false", "1 / 0"],
              ["0.375", "37.5% credit"],
              ["null", "Unresolved"],
              ["Outside 0–1, NaN, or a string", "A judging error"],
            ],
          ),
          text(
            "The author chooses criterion IDs and all grading rules. No task-specific scorers or builder APIs are required. Custom JSON is retained as-is. An output without scores is unscored and cannot silently disappear from the benchmark denominator.",
          ),
        ],
      },
      {
        id: "hybrid",
        title: "Both files contribute to one eval",
        blocks: [
          code(
            "prompt.md",
            'Summarize the incident in ./incident.txt. Return a JSON object with a "summary" string.',
            "markdown",
          ),
          code(
            "judge.md",
            "## Criterion: supported_summary — Source-supported summary\n\nPass when the summary covers the incident's impact and resolution\nwithout contradicting the supplied report. Fail for missing or false\ninformation. Accept equivalent concise wording.",
            "markdown",
          ),
          code("judge.ts", hybridCode, "typescript"),
          text(
            "Supply incident.txt in the workspace. The LLM grades supported_summary, while code grades json_shape. Both read the same candidate recording. Duplicate criterion IDs are errors; neither source overwrites the other. A hybrid judgment becomes active only after both sources succeed.",
          ),
          note(
            "Equal weights",
            "The files themselves have no weight. Each named criterion contributes equally within the eval. A code score of 0.5 and an LLM score of 1 produce 75% for that repetition.",
          ),
        ],
      },
      {
        id: "context",
        title: "All the recorded data, with lazy native access",
        blocks: [
          table(
            ["Context primitive", "What it provides"],
            [
              [
                "response / prompt",
                "The final root answer and exact task prompt.",
              ],
              [
                "run",
                "The EvalRun, model reference, outcome, and execution inputs. Null for constructed controls.",
              ],
              [
                "metrics",
                "Candidate-only usage, cost, tool reliability, compactions, and timing.",
              ],
              [
                "recording.events(filter?)",
                "Native events with recorded sequence and time; filter by sessionID or type.",
              ],
              [
                "recording.tools(filter?)",
                "Recorded invocations, inputs, outputs, errors, and durations.",
              ],
              [
                "recording.sessions()",
                "All sessions belonging to the candidate's isolated native database.",
              ],
              [
                "recording.messages(sessionID?)",
                "Complete paginated message history, including before compaction.",
              ],
              [
                "recording.export(sessionID?)",
                "Native OpenCode session export.",
              ],
              [
                "workspace.files/read/text/diff",
                "Verified initial and final file snapshots.",
              ],
              [
                "workspace.materialize(revision?)",
                "A disposable workspace copy for author-owned verification commands.",
              ],
              [
                "native.database()",
                "Read-only SQLite access to a verified archive copy.",
              ],
              [
                "native.sdk() / native.schema()",
                "The pinned OpenCode SDK/API and schema. SDK operations use a disposable copy.",
              ],
            ],
          ),
          code(
            "independent inspection",
            'import { readRecording } from "@hona/openeval";\n\nawait using context = await readRecording("./results/RUN", "eval_ID");\nconst messages = await context.recording.messages();\nconst db = await context.native.database();\nconsole.log(db.query("SELECT name FROM sqlite_master").all());',
            "typescript",
          ),
          text(
            "The runner owns reader lifetimes and initializes native services only when requested. Native reads are bound to the recorded database, not your live OpenCode service. The SDK opens supported native schemas on disposable copies; recorded and reader versions remain distinct metadata.",
          ),
        ],
      },
      {
        id: "measurements",
        title: "Common measurements are automatic",
        blocks: [
          table(
            ["Metric", "Definition"],
            [
              [
                "cost / tokens",
                "Deduplicated recorded OpenCode usage across candidate sessions, including recorded auxiliary usage such as compaction.",
              ],
              [
                "tools.errorRate",
                "Failed / (succeeded + failed). Null when no terminal calls exist; unfinished calls are separate.",
              ],
              [
                "requests / compactions",
                "Recorded starts, completions, failures, and retry events.",
              ],
              [
                "timing.modelActiveMs",
                "Union of closed model-step and compaction intervals, including time within those steps.",
              ],
              [
                "timing.outputTokensPerSecond",
                "Reported output tokens per model-active second; overlapping intervals count once.",
              ],
            ],
          ),
          text(
            "A successful shell tool returning a failed test is distinct from a native tool failure. Counts describe recorded native invocations, not inferred operations inside a batch. Missing usage is unavailable. Reported zero cost does not establish free service.",
          ),
          text(
            "Token categories keep their native meanings. Avoid double-counting reasoning/output or cache categories. These observations affect a score only when the author's function or rubric explicitly uses them. Markdown judges can inspect the same primitives through candidate_evidence with action metrics.",
          ),
        ],
      },
      {
        id: "execution",
        title: "Frozen inputs, bounded execution, inspectable results",
        blocks: [
          {
            type: "image",
            image: "code-judgment.png",
            alt: "A code judgment with boolean and fractional criterion scores, returned JSON, and frozen source",
            caption:
              "Illustrative label-reading task. The code judge ran on constructed responses; no candidate model was called.",
          },
          text(
            "The host bundles local imports without executing the judge during planning. Source maps and dependency manifests/lockfiles are recorded with its fingerprint. Code and reference changes schedule rejudging; the candidate recording is reused.",
          ),
          text(
            "judge.ts runs in a separate Bun process under judge.timeoutMs, so the host can stop synchronous loops. Code and hybrid evals grade finalized recordings; earlyStop is supported for Markdown-only evals. The viewer shows returned JSON, frozen source, process logs, and candidate metrics.",
          ),
          code(
            "code-only calibration",
            'import { recordEvidence, judgeEvidence } from "@hona/openeval";\n\nconst evidence = await recordEvidence({\n  directory: "./controls/apple/evidence",\n  prompt: "Reply with exactly APPLE.",\n  response: "APPLE",\n});\nconst result = await judgeEvidence({\n  evidence,\n  code: "./evals/exact-answer/judge.ts",\n  directory: "./controls/apple/judge",\n});',
            "typescript",
          ),
          text(
            "Code-only controls use no model calls unless the author writes one explicitly. The original JSON is retained, while normalized scores are stored with their source. Failed grading does not overwrite finalized judgments.",
          ),
        ],
      },
    ],
  },
  {
    slug: "workspaces",
    title: "Prepare a workspace",
    group: "Author",
    description: "Give every candidate a controlled starting point.",
    sections: [
      {
        id: "local",
        title: "Start from readable project files",
        blocks: [
          code(
            "evals/query-from-schema/",
            `prompt.md\njudge.md\neval.ts          # optional preparation\nworkspace/\n  schema.sql\n  package.json\n  bun.lock`,
            "text",
          ),
          code("eval.ts", preparation, "typescript"),
          text(
            "Without a workspace, the candidate starts in an empty directory. Preparation runs before the initial evidence snapshot and earns no candidate credit.",
          ),
        ],
      },
      {
        id: "git",
        title: "Pin external source code",
        blocks: [
          code(
            "eval.ts · replace the repository and commit",
            `import type { Eval } from "@hona/openeval";\n\nexport default {\n  workspace: {\n    repository: "https://github.com/example/project.git",\n    commit: "0123456789abcdef0123456789abcdef01234567",\n    ref: "main",\n    overlay: "fixtures/dependencies",\n  },\n  prepare: [\n    { cwd: "checkout", argv: ["bun", "install", "--frozen-lockfile"] },\n  ],\n} satisfies Eval;`,
            "typescript",
          ),
          table(
            ["Setting", "Purpose"],
            [
              [
                "repository + commit",
                "Credential-free HTTPS URL and a full 40-character commit SHA",
              ],
              ["ref", "Initial branch or revision"],
              ["overlay", "Readable files applied to the fetched checkout"],
              ["checkout", "Checkout directory name; defaults to checkout"],
            ],
          ),
        ],
      },
      {
        id: "revisions",
        title: "Declare a synthetic Git history",
        blocks: [
          code(
            "eval.ts",
            `import type { Eval } from "@hona/openeval";\n\nexport default {\n  workspace: {\n    ref: "main",\n    revisions: [\n      { ref: "main", directory: "fixtures/main", message: "Initial project" },\n      { ref: "next", directory: "fixtures/next", message: "Update schema" },\n    ],\n    overlay: "fixtures/local",\n  },\n} satisfies Eval;`,
            "typescript",
          ),
          text(
            "Revision directories are applied in order and committed by the host. Use overlays for intentional local state. The candidate sees ordinary project files and Git metadata.",
          ),
        ],
      },
    ],
  },
  {
    slug: "running",
    title: "Run your benchmark",
    group: "Run & inspect",
    description: "Plan a small batch, control cost, and keep one aggregate.",
    sections: [
      {
        id: "small-batch",
        title: "Start with a scoped plan",
        blocks: [
          code(
            "terminal",
            `bunx --bun @hona/openeval plan \\\n  --only-eval ask-dialect \\\n  --only-model provider/candidate-model \\\n  --only-repetition 1\n\nbunx --bun @hona/openeval run \\\n  --only-eval ask-dialect \\\n  --only-repetition 1`,
            "shell",
          ),
          table(
            ["Scope", "What stays in the result"],
            [
              ["--only-eval", "Other evals and their active scores"],
              ["--only-model", "Other models and their active scores"],
              ["--only-repetition", "The configured repetition count"],
              ["No scope flags", "All missing or changed work"],
            ],
          ),
          text(
            "Repeat a scope flag to select multiple values. Scope controls execution, not the benchmark's denominator.",
          ),
        ],
      },
      {
        id: "resume",
        title: "Reuse evidence deliberately",
        blocks: [
          table(
            ["What changed?", "Next run"],
            [
              ["Nothing", "Reuse the selected candidate and judgment"],
              [
                "Prompt, workspace, or candidate runtime",
                "Collect new candidate evidence for affected inputs",
              ],
              [
                "Rubric or shared judge instructions",
                "Rejudge the retained recording",
              ],
              ["A new model", "Add its eval / repetition slots"],
              ["--new", "Create a separate benchmark result"],
            ],
          ),
          note(
            "One runner per aggregate",
            "Let an active invocation finish before extending the same result with another invocation. Failed executions require an explicit retry or rejudge.",
          ),
        ],
      },
      {
        id: "budget",
        title: "Bound candidate and judge work",
        blocks: [
          code(
            "terminal",
            `bunx --bun @hona/openeval run --max-cost 5\nbunx --bun @hona/openeval run --final-only`,
            "shell",
          ),
          table(
            ["Control", "Meaning"],
            [
              [
                "concurrency",
                "Shared candidate / judge worker limit; default 10",
              ],
              [
                "--max-cost",
                "Admission budget using reported spend and reservations",
              ],
              ["Candidate timeout", "At most 45 minutes per candidate"],
              ["--final-only", "Judge after the candidate finishes"],
            ],
          ),
          text(
            "A scheduling budget stops admitting new work. Active sessions finish normally, so final billing can exceed the admission budget. Work without a cost estimate can be deferred.",
          ),
          code(
            "eval.ts · opt-in early stopping",
            `import type { Eval } from "@hona/openeval";\n\nexport default {\n  earlyStop: { minIntervalMs: 45_000, maxChecks: 12, maxCostUSD: 1 },\n} satisfies Eval;`,
            "typescript",
          ),
          text(
            "Early stopping requires every criterion score to be irreversible and non-null. Monitoring cannot steer the candidate. If monitoring pauses or exhausts its budget, final grading still follows execution.",
          ),
        ],
      },
    ],
  },
  {
    slug: "scoring",
    title: "Understand the scores",
    group: "Run & inspect",
    description:
      "Equal eval weights. Visible unknowns. One final percentage per model.",
    sections: [
      {
        id: "formula",
        title: "Three averages, in order",
        blocks: [
          {
            type: "flow",
            steps: [
              "Repetitions → criterion",
              "Criteria → eval",
              "Evals → benchmark %",
            ],
          },
          code(
            "aggregation",
            `criterion score = mean(repetition scores)\neval score = mean(criterion scores in this eval)\nbenchmark score = 100 × mean(eval scores)`,
            "text",
          ),
          text(
            "An eval with more criteria does not get more benchmark weight. Each eval contributes equally to the final percentage.",
          ),
        ],
      },
      {
        id: "try-it",
        title: "Change a decision. See the score.",
        blocks: [
          { type: "calculator" },
          note(
            "Completion bounds",
            "Unknown values leave a possible final-score range. These are completion bounds, not confidence intervals. A known failure contributes zero and is still a scored check.",
          ),
        ],
      },
      {
        id: "read",
        title: "Read each number in context",
        blocks: [
          table(
            ["Viewer value", "Interpretation"],
            [
              [
                "Final percentage",
                "All required criterion scores have known values",
              ],
              [
                "Checks scored",
                "Criterion scores across evals and repetitions",
              ],
              [
                "Eval drilldown",
                "Individual criterion scores for one selected eval",
              ],
              [
                "Runtime",
                "Union of active execution intervals; overlapping work counts once",
              ],
              [
                "ETA",
                "Estimate for scheduled work using candidate and judge stage timings",
              ],
              ["Cost", "Reported candidate and judge spend"],
            ],
          ),
          {
            type: "image",
            image: "results.png",
            alt: "OpenEval model score chart with three illustrative models",
            caption:
              "Illustrative viewer data. Every model has one benchmark score.",
          },
        ],
      },
    ],
  },
  {
    slug: "evidence",
    title: "Read the evidence",
    group: "Run & inspect",
    description: "Follow a score back to the work that earned it.",
    sections: [
      {
        id: "inspect",
        title: "Open a run, then its judgment",
        blocks: [
          {
            type: "flow",
            steps: [
              "Select an eval",
              "Open a model run",
              "Read Session / Judge",
              "Follow a citation",
            ],
          },
          {
            type: "image",
            image: "judgment.png",
            alt: "SQL rubric decisions and evidence links in the judge inspector",
            caption:
              "Illustrative SQL evaluation: two decisions from the same recorded answer.",
          },
          table(
            ["Citation", "What it points to"],
            [
              ["response", "The final user-facing answer"],
              ["message", "A recorded session message"],
              ["tool", "A recorded tool call and its result"],
              ["event", "An event in the execution recording"],
              ["artifact", "A file from the initial or final workspace"],
            ],
          ),
        ],
      },
      {
        id: "revise",
        title: "Revise a rubric without losing evidence",
        blocks: [
          code(
            "terminal",
            `bunx --bun @hona/openeval rejudge ./results/RUN_ID EVAL_RUN_ID\nbunx --bun @hona/openeval snapshot ./results/RUN_ID before-rubric-update`,
            "shell",
          ),
          text(
            "Finalized EvalRuns and JudgeRuns are immutable. A completed rejudge updates the active selection; the original recording and earlier judgments remain available.",
          ),
        ],
      },
      {
        id: "calibrate",
        title: "Calibrate the judge",
        blocks: [
          table(
            ["Control", "What to establish"],
            [
              [
                "Positive",
                "A valid response passes through an equivalent workflow",
              ],
              ["Negative", "A real failure is detected"],
              [
                "Borderline",
                "A partial answer, correction, or omission is handled deliberately",
              ],
              [
                "Unavailable evidence",
                "The judge returns unknown rather than inventing an observation",
              ],
            ],
          ),
          code(
            "SDK exports for author-owned controls",
            `import { recordEvidence, judgeEvidence } from "@hona/openeval";\n\n// recordEvidence: create a recording from supplied text and tool records.\n// judgeEvidence: grade retained evidence in a separate audit directory.`,
            "typescript",
          ),
          text(
            "Keep calibration examples outside candidate workspaces. Use expected labels you have reviewed, and inspect disagreements before changing a rubric.",
          ),
        ],
      },
    ],
  },
  {
    slug: "reference",
    title: "CLI & file reference",
    group: "Reference",
    description: "The author-facing controls, in one place.",
    sections: [
      {
        id: "files",
        title: "Eval file contract",
        blocks: [
          table(
            ["File", "Required", "Used for"],
            [
              [
                "benchmark.ts",
                "Yes · project",
                "Models, judge, repetitions, concurrency",
              ],
              ["evals/<id>/prompt.md", "Yes · eval", "Verbatim candidate task"],
              [
                "evals/<id>/judge.md",
                "One or both judge files",
                "A rubric with named criteria and scoring rules",
              ],
              [
                "evals/<id>/judge.ts",
                "One or both judge files",
                "A plain function receiving JudgeContext and returning JSON",
              ],
              [
                "evals/<id>/eval.ts",
                "Optional",
                "Workspace preparation and early stopping",
              ],
              [
                "evals/<id>/workspace/",
                "Optional",
                "Candidate-visible starting files",
              ],
            ],
          ),
        ],
      },
      {
        id: "commands",
        title: "Commands",
        blocks: [
          table(
            ["openeval …", "Action"],
            [
              ["image", "Build the isolated candidate runtime"],
              ["plan", "Preview missing / changed work and cost estimates"],
              ["run", "Execute the current plan"],
              ["view", "Serve the bundled results viewer"],
              ["retry <run> <eval-run>", "Retry a candidate execution"],
              ["rejudge <run> <eval-run>", "Judge existing evidence again"],
              [
                "snapshot <run> <name>",
                "Freeze the active scores into a named snapshot",
              ],
              [
                "add-models <run> --model <ref>",
                "Extend an idle aggregate with more models",
              ],
              [
                "merge-runs <target> <source>",
                "Merge results into one aggregate",
              ],
            ],
          ),
        ],
      },
      {
        id: "flags",
        title: "Flags",
        blocks: [
          table(
            ["Flag", "Applies to", "Purpose"],
            [
              [
                "--benchmark <dir>",
                "All benchmark commands",
                "Benchmark directory; default current directory",
              ],
              ["--run <dir>", "run / plan", "Use a specific result"],
              ["--new", "run", "Start a separate result"],
              ["--model <ref>", "run / plan / add-models", "Add a model"],
              [
                "--only-model <ref>",
                "run / plan",
                "Limit execution to a model; repeatable",
              ],
              [
                "--only-eval <id>",
                "run / plan",
                "Limit execution to an eval; repeatable",
              ],
              [
                "--only-repetition <n>",
                "run / plan",
                "Limit execution to a repetition; repeatable",
              ],
              [
                "--max-cost <usd>",
                "run / plan",
                "Scheduling budget for this invocation",
              ],
              ["--final-only", "run", "Disable monitoring for this invocation"],
              ["--port <n>", "view", "Viewer port; default 4173"],
            ],
          ),
        ],
      },
      {
        id: "configuration",
        title: "Benchmark settings",
        blocks: [
          table(
            ["Setting", "Default", "Meaning"],
            [
              [
                "models",
                "Required",
                "Unique provider/model references; optional #variant",
              ],
              [
                "judge.model",
                "Required with judge.md",
                "Model used by the Markdown judge",
              ],
              ["repetitions", "3", "Candidate executions per eval / model"],
              ["concurrency", "10", "Shared worker budget"],
              [
                "candidate.timeoutMs",
                "45 minutes",
                "Candidate limit; cannot exceed 45 minutes",
              ],
              ["judge.timeoutMs", "10 minutes", "Judge execution timeout"],
              [
                "candidate.websearch / judge.websearch",
                "exa",
                "Search provider, or false",
              ],
              ["container.engine", "docker", "docker or podman"],
              [
                "container.cpus / memoryMiB",
                "2 / 4096",
                "Per-container resources",
              ],
            ],
          ),
        ],
      },
    ],
  },
];

export const docHref = (slug: string) => `/docs/${slug}/`;
export const findDoc = (path: string) =>
  docs.find((d) => docHref(d.slug) === path.replace(/\/?$/, "/"));
export const searchDocs = (query: string) => {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return docs
    .flatMap((doc) =>
      doc.sections.map((section) => ({
        doc,
        section,
        haystack:
          `${doc.title} ${doc.description} ${section.title} ${JSON.stringify(section.blocks)}`.toLowerCase(),
      })),
    )
    .filter((item) => terms.every((term) => item.haystack.includes(term)))
    .slice(0, 10);
};
