# Eval Writing skill

An OpenCode skill for helping a human design and review agent evaluations. It
uses concrete counterexamples to improve prompts, rubrics, evidence collection,
and grader validation.

## Install

In an OpenCode session opened in this repository, the skill is discovered
automatically.

To use it in another project, copy this **entire directory**, including
`references/`, into that project's `.opencode/skills/eval-writing/` directory.
The [project skill ZIP](https://openev.al/eval-writing.zip) contains that exact
layout. Extract it into your project root.
For all your projects, put it in
`~/.config/opencode/skills/eval-writing/` instead. The repository's
[Download ZIP](https://github.com/Hona/openeval/archive/refs/heads/main.zip)
includes the skill files. Preserve the directory structure:

```text
eval-writing/
  SKILL.md
  README.md
  references/
    examples.md
    openeval.md
    research.md
```

OpenCode V2 uses the directory name as the skill ID. See the
[official skill documentation](https://opencode.ai/v2/docs/skills) for discovery
and project/global precedence.

The site also publishes a native [OpenCode V2 HTTP catalog](https://openev.al/skills/index.json)
at `https://openev.al/skills/`. Its named `eval-writing.md` entry retains the skill
ID in V2; its version changes when the public skill files change. The project
ZIP uses the usual `eval-writing/SKILL.md` layout for source-controlled installs.

## Use

Run `/eval-writing`, or ask the agent to use the skill:

> Use eval-writing to review this task and rubric. Show me the strongest false
> pass and false failure, then propose the smallest improvement.

> Help me turn this user-reported failure into an eval. Ask about the boundaries
> that could change the score before drafting the rubric.

The main workflow applies across evaluation frameworks. The
[OpenEval reference](references/openeval.md) maps it to `prompt.md`, `judge.md`,
the public SDK, and immutable recordings. The
[coaching examples](references/examples.md) are fictional design exercises.
[Research notes](references/research.md) explain the supporting public sources
and their limits.

Licensed under this repository's MIT license.
