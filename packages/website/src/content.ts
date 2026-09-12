import {
  benchmark,
  preparation,
  prompt,
  rubric,
  runCommands,
} from "./examples";
import type { ScreenshotName } from "./media";

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
    description: "From two Markdown files to a recorded, scored agent run.",
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
            "One recording, two checks",
            "The answer is graded separately for asking about the SQL dialect and using bound parameters. A question-only answer passes the first metric and fails the second.",
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
                "Make that outcome explicit in each metric.",
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
        id: "metrics",
        title: "Declare each metric",
        blocks: [
          code("judge.md", rubric, "markdown"),
          table(
            ["Part", "Contract"],
            [
              [
                "## Metric: id — Label",
                "Declares a stable metric ID and a display label",
              ],
              [
                "Pass and fail criteria",
                "State the observable behavior, including omissions",
              ],
              [
                "Domain references",
                "Supply version-correct facts and relevant sources",
              ],
              [
                "Multiple metrics",
                "All declared metrics are graded from the same recording",
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
            "An observed omission can fail a metric. If the necessary recording is unavailable, the judge can return null. An unresolved metric keeps the final benchmark percentage unresolved.",
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
              "Submit every metric",
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
                "Validate metric IDs and 0 / 1 / null values",
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
                "Aggregate metric values consistently",
              ],
            ],
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
            "Early stopping requires every metric decision to be irreversible and non-null. Monitoring cannot steer the candidate. If monitoring pauses or exhausts its budget, final grading still follows execution.",
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
              "Repetitions → metric",
              "Metrics → eval",
              "Evals → benchmark %",
            ],
          },
          code(
            "aggregation",
            `metric = mean(repetitions)\neval = mean(metrics in this eval)\nbenchmark = 100 × mean(evals)`,
            "text",
          ),
          text(
            "An eval with more metrics does not get more benchmark weight. Each eval contributes equally to the final percentage.",
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
                "All required metric checks have known values",
              ],
              [
                "Checks scored",
                "Metric decisions across evals and repetitions",
              ],
              ["Eval drilldown", "Individual metrics for one selected eval"],
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
            "Finalized eval runs and judge runs are immutable. A completed rejudge updates the active selection; the original recording and earlier judgments remain available.",
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
                "Yes · eval",
                "Declared metrics and grading criteria",
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
              ["judge.model", "Required", "Model that grades the recording"],
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
