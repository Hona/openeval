# Set up OpenEval with me

Help me set up OpenEval in the right project and create my first eval. Make the
file changes and run the setup commands yourself. Guide me through the decisions
in small steps, using what I have already told you.

Start by fetching https://openev.al/llms.txt. It is the documentation index; follow
the relevant Markdown links as you reach each step. Use the published
`@hona/openeval` SDK and CLI. The index identifies the current documented release.
For OpenCode itself, use https://opencode.ai/v2/llms.txt and its V2 documentation.

## How to work with me

- Give me a short update before each meaningful step: what we are doing and the
  decision, if any, that you need from me.
- Ask one focused question at a time. Offer a sensible default and at most two
  or three choices. Wait for my answer when it changes the setup.
- Reuse answers from our conversation. If I have already chosen the directory,
  task, models, or run scope, act on that choice.
- Keep explanations brief. Show the file, command, or example that makes the
  next decision concrete. Save detailed logs for a failure that needs them.
- Continue useful setup work while a separate decision is pending. Finish the
  agreed work rather than handing me a checklist of commands to execute.

## 1. Confirm where this belongs

Inspect the current directory, repository instructions, Git status, package
manager, workspaces, and any existing benchmark.ts or evals directory.

Use the current directory when it is clearly an OpenEval/benchmark project or
an empty project. Use a location I have already selected. In an unrelated or
populated application repository, suggest a dedicated benchmark package or
directory and ask where it should go before creating files.

State the selected path. Preserve existing files, package settings, and local
changes. Reuse a benchmark that is already there instead of creating a second
one. Keep the authoring skill at the project root, outside candidate workspaces.

## 2. Check the prerequisites

Read the quick start and CLI reference from the index. Check these in the
selected project:

| Prerequisite                                      | Check                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Bun 1.4.2 or later                                | Run `bun --version`.                                                                                                      |
| Docker, or the project's configured Podman engine | Check the CLI and a working daemon with `docker info` or `podman info`. Linux containers must be available.               |
| OpenCode V2                                       | Check `opencode --version`, or `opencode2 --version` if that is the installed command.                                    |
| Model access                                      | Check the project's connected providers and available models. A running OpenCode process alone does not establish access. |
| Project dependencies                              | Inspect the manifest and lockfile; use the project's package manager.                                                     |

Install missing prerequisites when your tools and the environment allow it.
Use the official Bun, container-engine, and OpenCode V2 installation guides.
If installation, starting Docker, or signing in needs my interaction, give me
one concrete action, then verify the result before proceeding.

For model access, use OpenCode's supported catalog/API or ask me to use
`/connect` and `/models` in this project. Use the installed V2 executable name
consistently. Keep credentials in OpenCode's connection flow.

Install the exact released `@hona/openeval` version named in the index, with
`bun add --exact @hona/openeval@VERSION` or the project's equivalent. Keep an
existing exact supported pin unless an upgrade is needed and agreed. Verify
the installed CLI with `bunx --bun @hona/openeval --version`.

The small documentation demo needs no web search. Set candidate and judge
websearch to false for it. For my own task, check any additional fixture,
network, search-provider, or preparation requirements that the task needs.

## 3. Install and use the Eval Writing skill

Download https://openev.al/eval-writing.zip with a download-capable tool and
extract its `.opencode/skills/eval-writing/` directory into the selected project
root. Install the entire directory, including README.md and references/.
The source is the public Hona/openeval repository linked in the index.

If the project already has eval-writing, inspect it first and keep its local
customizations. Resolve a conflicting installation with me rather than replacing
it silently. Verify that SKILL.md and its linked reference files are present.

Load `eval-writing` through OpenCode's skill tool. If the current session has
not discovered the new skill yet, read the installed SKILL.md and its OpenEval
reference directly for this setup. It is available as `/eval-writing` when
discovered. Keep all these files in source control with the benchmark project.

## 4. Choose one first eval

If I have already described a task, work on that task. Otherwise ask:

> Would you like to try the small SQL example, or turn one of your own tasks
> into an eval?

### The basic example

Use the SQL task and rubric from the quick start. Show me prompt.md and judge.md.
Explain only the key distinction: the candidate does the task; the judge scores
its recorded work. The two criteria check asking for the SQL dialect and using
bound parameters. A question-only answer passes the first and fails the second.

Keep the example's prompt and rubric intact. Label it as a setup demo.

### One task of my own

Use the installed skill to help me describe one real task. Ask only for missing
details that would change the eval:

- What should the candidate do, and what files or context should it start with?
- What would one acceptable result and one failure look like?
- What recorded evidence distinguishes them? Are follow-up questions part of
  success, and can this task actually receive a reply?

Ask these progressively, not as a questionnaire. Briefly reflect the task and
success boundary back to me before drafting. Keep my task wording intact unless
I request an edit. Put grading rules in the judge, not in the candidate prompt.

Choose a plain judge.ts function for an exact, deterministic check; use judge.md
when judgment is needed, or both for distinct criteria. Explain the choice in
one sentence. Check a clear pass, a clear failure, a valid alternative, and an
empty or clarification-only response. Resolve a meaningful boundary with me.
Stay with this one eval through its first useful result.

## 5. Create the files and choose models

Create or update:

```text
benchmark.ts
evals/<eval-id>/
  prompt.md
  judge.md       # a rubric, a code judge, or both
  judge.ts
  eval.ts        # only if workspace preparation is needed
```

Use public `Benchmark`, `Eval`, and `JudgeContext` types. Markdown criteria use
`## Criterion: id — Label`. Code judges return an optional scores map and custom
JSON; use the documented plain-function API. Keep judge inputs, controls, and
results outside the candidate workspace. Pin external workspace inputs.

Ask which candidate model or models and variants I want to compare. Show a
short selection from my available OpenCode models rather than a huge catalog.
Use exact `provider/model#variant` references. Variants come from that model's
catalog; omit the suffix for its default. Confirm the choice in a short list.

If this eval uses judge.md, ask which model should judge it and suggest an
available suitable model. A code-only eval does not need a judge model.
Start with one repetition. If I choose several models, keep them configured
and suggest one model for the initial smoke run before expanding.

## 6. Validate and show the plan

Load the declaration with the public SDK and run the project's relevant local
checks. For a deterministic judge, exercise its agreed boundary examples without
calling a model. Describe an LLM rubric as reviewed, not calibrated, until it has
actually been checked against labeled evidence.

Build the runtime image with `bunx --bun @hona/openeval image`. Inspect a small
plan from the benchmark directory, substituting the chosen eval and model:

```sh
bunx --bun @hona/openeval plan --only-eval EVAL_ID --only-model "PROVIDER/MODEL#VARIANT" --only-repetition 1
```

Show the chosen task, candidate model/variant, judge if needed, repetition count,
and the plan's cost estimate or unavailable estimate. If I specify a budget,
apply the same `--max-cost` to plan and run. It controls admission of new work;
active sessions can finish above that amount.

## 7. Ask whether to run and watch

Unless I have already decided, ask:

> Run this first eval now and watch it in the browser, run it in the terminal,
> or leave it ready to run later?

Honor my chosen scope. Run with the same eval, model, repetition, and budget
flags as the plan:

```sh
bunx --bun @hona/openeval run --only-eval EVAL_ID --only-model "PROVIDER/MODEL#VARIANT" --only-repetition 1
```

For browser viewing, start `bunx --bun @hona/openeval view` in a separate
terminal/background process from the same benchmark directory. Open the printed
URL, normally http://127.0.0.1:4173, using an available browser tool. Reuse a
viewer tab if one is already open. If you cannot open a browser, give me the URL.
Keep the run and viewer available while I watch. If the port is occupied, inspect
the existing service or use the documented `--port` option.

Follow the run to completion, explain a real setup failure briefly, and repair it
within the agreed scope. Retain the evidence. Use explicit retry/rejudge commands
when appropriate; do not start fresh with `--new` to hide a failure.

## 8. Hand back the result

Keep the handoff short:

- The project path and the files we created or changed.
- The candidate models/variants, judge, and repetitions we used.
- The criterion scores, recorded cost, and results directory, when collected.
- The viewer URL and where to find the candidate session and judgment.
- One useful next step: revise this eval or run the remaining selected models.

Show what earned the score rather than only quoting a percentage. Distinguish a
failed criterion from a missing judgment or setup error. If I chose to run later,
say that the setup is ready and give the exact scoped run and viewer commands.
