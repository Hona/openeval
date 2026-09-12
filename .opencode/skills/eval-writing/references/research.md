# Public research guide

Reviewed **2026-09-12**, with emphasis on **2025-09-12–2026-09-12** publications
and revisions. Older foundations are dated explicitly. Living methodology pages
are identified by the version or content available at review time.

DeepSWE, Anthropic, and OpenAI are the main starting references. The broader
cross-lab review tests their advice against other settings. This is a practical,
purposive synthesis, not an exhaustive literature review or independent replication.
Lab results are author reports; arXiv entries are treated as preprints. Read the
original methods and limitations before transferring a quantitative claim.

## Principles to carry into an eval review

| Principle | Why it matters |
| --- | --- |
| Match the criterion to the user's goal | A precise check can still measure the wrong thing |
| Admit multiple valid solutions | A reference implementation is not the entire acceptance set |
| Require meaningful delivery when intended | No false statements can be achieved by giving no answer |
| Check observed work and the actual environment | Claims, setup output, and simulations can misrepresent execution |
| Validate rubric formation and rubric application | A strong judge cannot repair a wrong criterion by confidence alone |
| Audit labels, reasons, and stability separately | A repeatable or correctly labeled judgment can still be unsound |
| Specify opportunities, budgets, and feedback | Changing these can change the behavior being measured |
| Keep score meanings distinct | Partial progress, full success, preference, and reliability are different |
| Preserve provenance and held-out validation | Iteration can otherwise become tuning to a desired result |

## DeepSWE: task quality and acceptance breadth

- **[DeepSWE methodology](https://deepswe.datacurve.ai/blog/deepswe)**
  (2026-05-26), especially task construction, QA, and limitations. Align the
  verifier with requested behavior, accept different correct implementations,
  inspect near misses, and eliminate incidental environment failures. Short
  prompts still need sufficient context; wider model separation is not itself
  proof of validity.
- **[DeepSWE v1.1](https://deepswe.datacurve.ai/blog/deepswe-v1-1)**
  (2026-06-14). Isolated artifact verification, natural Git setup without future
  history, dependency fixes, and structured reports improve reproducibility.
  Its committed-patch contract is specific to that benchmark, not a universal
  requirement for evaluating recorded behavior.
- **[DeepSWE paper](https://arxiv.org/html/2607.07946v1)**
  (2026-07-08), §§4–5, 7–8. Equal task weighting, explicit sampling/exclusion
  policies, and bounded claims make scores interpretable. Run-to-run uncertainty
  omits task-selection uncertainty; the LLM verifier audit reports disagreements,
  not independently certified ground truth.
- **[Benchmark README and code](https://github.com/datacurve-ai/deep-swe)**
  (living repository). The task, environment, verifier, reference solution, and
  emitted reports expose the measurement contract. Reuse the design principles
  rather than assuming another framework's file format or scoring semantics.

## Anthropic: real failures, contrasting contexts, and transcript review

- **[Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)**
  (2026-01-09). Start with real manual checks, prove feasibility, calibrate
  graders, inspect transcripts, and include should/should-not contexts. Separate
  capability growth from regression protection. Suggested suite sizes and grader
  architectures are examples, not quotas or permission to add tasks automatically.
- **[Quantifying infrastructure noise](https://www.anthropic.com/engineering/infrastructure-noise)**
  (2026-02-05). Allocation, resource enforcement, timeouts, and provider conditions
  can change results. Match and report the relevant execution conditions. A
  particular memory multiplier or score spread is not a universal correction.
- **[Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)**
  (2025-09-11; earlier foundation). Tool descriptions shape behavior, raw traces
  reveal failures absent from summaries, and held-out tasks check overfitting.
  Tolerance for valid paths matters more than a preferred tool-call sequence.
- **[Bloom](https://alignment.anthropic.com/2025/bloom-auto-evals/)**
  (2025-12-19). Defining behavior, generating situations, simulating interaction,
  and judging are separate sources of variation. Validate the opportunities and
  the judge. A seed configuration is not identical realized inputs, and simulated
  tools do not establish real-world execution or deployment prevalence.
- **[Petri 2.0](https://alignment.anthropic.com/2026/petri-v2/)**
  (2026-01-22). Removing artificial cues can also make the target opportunity
  harder to encounter. Preserve the intended decision while improving realism.
  Lower observed failure rates may reflect fewer opportunities; verbalized
  evaluation awareness is an incomplete proxy for awareness.

## OpenAI: define the objective and audit the measurement

- **[Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)**
  (living guide). Define objectives, collect relevant examples, specify criteria,
  and iterate against human feedback. Include ordinary, edge, and adversarial
  cases. Pass/fail and specific comparisons can be easier to validate than broad
  subjective ratings; no recommended model or numeric example is permanent policy.
- **[Introducing SWE-bench Verified](https://openai.com/index/introducing-swe-bench-verified/)**
  (2024-08-13, updated 2025-02-24; foundation). Hidden implementation details,
  ambiguous requests, and unstable environments can reject valid solutions.
  Independent expert review matters. The later audits below show that an initial
  “verified” label is not a permanent guarantee.
- **[Why SWE-bench Verified no longer measures frontier coding capabilities](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/)**
  (2026-02-23). Residual task flaws can interact with exposure to public solutions.
  Reassess surprising successes and apparent saturation. Its quoted defect rate
  is for a selected difficult subset, not the entire dataset; its interim
  recommendation of SWE-bench Pro was withdrawn in the next source.
- **[Separating signal from noise in coding evaluations](https://openai.com/index/separating-signal-from-noise-coding-evaluations/)**
  (2026-07-08). Check overly strict tests, unstated requirements, insufficient
  coverage, and misleading prompts. Distinguish normal repository discovery from
  information genuinely unavailable to the candidate. Human review may find
  overlapping issues that automated summaries miss.
- **[A shared playbook for trustworthy third party evaluations](https://openai.com/index/trustworthy-third-party-evaluations-foundations/)**
  (2026-05-29). Controlled comparisons and strong capability elicitation support
  different claims. Harness, tools, context handling, budgets, and retries belong
  in the result. A vendor-specific harness recommendation is not a mandate to
  change every evaluator's setup.
- **[GDPval](https://openai.com/index/gdpval/)**
  (2025-09-25). Real work products, expert authoring/review, and blind comparisons
  ground evaluation in professional tasks. Preference, functional quality, and
  workplace productivity are not interchangeable. One-shot artifacts and inference
  costs omit collaboration, oversight, and integration costs.

## Google DeepMind: factuality settings and data exposure

- **[FACTS Benchmark Suite](https://deepmind.google/blog/facts-benchmark-suite-systematically-evaluating-the-factuality-of-large-language-models/)**
  (2025-12-09). Parametric knowledge, search, multimodal factuality, and grounding
  in supplied documents are distinct settings. Specify which one the task tests,
  standardize relevant tool access, and retain domain detail beneath an aggregate.
- **[Double-blind evaluation pilot](https://deepmind.google/blog/piloting-the-worlds-first-double-blind-ai-evaluations/)**
  (2026-08-27). Private storage, candidate isolation, and model-provider visibility
  are different boundaries. Ordinary API calls are not this cryptographic protocol;
  stronger privacy also does not by itself validate a task's criteria.

## DeepSeek: verification quality and the allowed interface

- **[DeepSeek-V3.2 technical report](https://arxiv.org/html/2512.02556v1)**
  (2025-12-02), §§3.2–4. Demonstrate solvability through the permitted tools and
  record message roles, retained reasoning, and context management. Distinguish
  real from synthesized environments. Training selection rules and nonzero
  sampled success are not proofs of representative, valid evaluation.
- **[DeepSeekMath-V2](https://arxiv.org/html/2511.22570v1)**
  (2025-11-27), §§2–3. A correct answer can conceal an invalid proof; a correct
  failure score can conceal a fabricated critique. Verify that the alleged flaw
  exists and warrants the label. Specialized self-verification and multiple votes
  do not certify arbitrary outputs or require access to private reasoning.

## Alibaba, Qwen, and Tongyi: stable intent, flexible evidence

- **[JADE](https://arxiv.org/html/2602.06486v4)**
  (v4, 2026-07-14). Expert-grounded criteria can remain stable while factual
  inspection adapts to the response's claims. Check whether evidence actually
  supports the conclusion. This does not justify per-response goalposts or
  automatically adopting its dynamic weights and verifier architecture.
- **[OccuBench](https://arxiv.org/html/2604.10866v2)**
  (v2, 2026-04-16), with CUHK. Validate simulator state and feasibility separately
  from candidate performance. Explicit errors and silent data degradation can
  test different abilities. Simulator agreement is not real-world validation;
  distinguish injected recoverable faults from accidental broken setup.
- **[Qwen3.8-Max evaluation footnotes](https://qwen.ai/blog?id=qwen3.8)**
  (2026-08-03 on the rendered page). Repeated means, best-of-harness scores,
  external results, retests, and binary/partial results require different labels.
  Read the conditions before comparing a shared benchmark name. Launch showcases
  do not establish controlled productivity or capability estimates.
- **[Search-Time Contamination in Deep Research Agents](https://arxiv.org/html/2606.05241v1)**
  (2026-06-03), Alibaba-NTU/Tongyi collaborators. Inspect actual retrieved content
  to distinguish benchmark metadata from explicit answers. A suspicious URL alone
  does not prove benefit or intent. The medical-benchmark findings and subset
  assumptions do not transfer as universal inflation estimates.

## Tencent and academic collaborators: rubric validity and interference

- **[RubricBench](https://arxiv.org/html/2603.01562v2)**
  (v2, 2026-03-03), CityU, Tencent Hunyuan, and collaborators. Derive criteria
  from instructions before inspecting responses, reconcile expert judgments,
  remove contradictions/redundancy, and validate on held-out work. Longer generated
  checklists can miss intent while enforcing tangential requirements. Neither
  human authorship nor more compute guarantees a valid rubric.
- **[Mitigating Rubric Interference / SARA](https://arxiv.org/html/2608.14684v2)**
  (v2, 2026-08-26), Peking University and Tencent Weixin AI. A criterion's label
  can change when other criteria are added, removed, or reordered. Probe this
  separately from repeated-sample stability. The study mainly tests smaller
  instruct models; isolated judgments are not ground truth, and its results do
  not establish that a particular deployed judge needs a new architecture.

## Moonshot, Z.ai, MiniMax, and ByteDance

- **[Kimi Vendor Verifier](https://www.kimi.com/blog/kimi-vendor-verifier)**
  (living post, body covering K2.6 reviewed 2026-09-12). Provider implementation,
  decoding parameters, vision preprocessing, and reasoning retention can affect
  measured performance. Validate the actual serving route rather than trusting
  a shared model name. Vendor diagnostics are not a universal equivalence certificate.
- **[Kimi K2.5 technical blog](https://www.kimi.com/blog/kimi-k2-5)**
  (2026-01-27). Distinguish useful subtask completion from inflated agent activity;
  document tools, context rules, exposure controls, failures, and repeated means.
  Critical-path or best-of-N metrics and transport-error policies are specific
  measurement choices, not interchangeable framework defaults.
- **[GLM-5.3](https://z.ai/blog/glm-5.3)**
  (2026-08-14). Test verifiers against feasible solutions, no-op/unsolved states,
  and valid alternatives. Overly broad import/pattern checks can mistake a local
  endpoint for a prohibited external API. Inspect actual effects and disclose
  benchmark modifications rather than silently waiving rules for one model.
- **[OctoCodingBench](https://www.minimax.io/news/production-grade-benchmark-for-coding-agents)**
  (2026-01-14). Explicit system/user/repository process constraints can be real
  requirements. Check-level success is different from satisfying every constraint
  in an instance. This motivates scoped process criteria, not arbitrary preferred
  command sequences or a universal style checklist.
- **[VIBE](https://www.minimax.io/news/why-we-built-vibe-bench-rethinking-evaluation-for-real-work)**
  (2026-01-05). Build/run success, usable interaction, and visual presentation
  require different observations. A screenshot alone cannot prove working
  interaction. The launch describes an agent verifier and forthcoming work;
  it is not independent proof of verifier reliability.
- **[EdgeBench](https://seed.bytedance.com/en/blog/edgebench-measuring-real-world-environment-learning-and-discovering-a-new-scaling-law)**
  (2026-07-07). Repeated feedback over long horizons measures learning within
  an environment, not one-shot performance. State the feedback regime and budget.
  Do not extrapolate its scaling curves to shorter runs or quietly give candidates
  access to evaluator-only feedback.

## Artificial Analysis: transparent methods and score meanings

- **[AA-Omniscience](https://artificialanalysis.ai/articles/aa-omniscience-knowledge-hallucination-benchmark)**
  (2025-11-16). Accuracy, wrong guesses, and abstention have different consequences.
  Specify denominators and test constant strategies such as always abstaining.
  Its signed reliability index is not a generic binary score; candidate abstention
  is not evaluator uncertainty.
- **[Intelligence benchmarking methodology](https://artificialanalysis.ai/methodology/intelligence-benchmarking)**
  (living document, v4.3 reviewed 2026-09-12). Prompts, extraction, retries, tool
  access, judges, weights, and observation limits define the score. A grader
  checking citation presence cannot thereby verify source entailment. Its reported
  uncertainty cannot be transferred to a different suite.
- **[Intelligence Index v4.2](https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-2)**
  (2026-09-04). Task selection, answer-key corrections, grading infrastructure,
  and weighting changes need versioned provenance. A changed index is not a changed
  model. Saturated tasks may still serve a regression purpose.
- **[Intelligence Index v4.3](https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-3)**
  (2026-09-07). AutomationBench-AA distinguishes partial objective completion from
  full workflow success and uses a task-level gate. Decide what essential conditions
  and partial credit mean before reporting a headline; do not import the gate or
  index weights into unrelated criteria.

## Meta, Microsoft, NVIDIA, Mistral, and xAI

- **[ARE / Gaia2](https://ai.meta.com/research/publications/are-scaling-up-agent-environments-and-evaluations/)**
  (2025-09-22; official research abstract reviewed for scope). Asynchronous events,
  ambiguity, noise, and temporal constraints reveal behavior absent from static
  tasks. The overview alone is not sufficient to adopt its scoring method.
- **[Measuring all the noises of LLM Evals](https://arxiv.org/html/2512.21326v2)**
  (v2, 2026-03-29), FAIR at Meta. Separate prediction noise from task-sampling
  noise and use paired, question-level comparisons when appropriate. More repeats
  do not create more task types. Its empirical results center on correctness
  evals; small-sample and cluster assumptions remain important.
- **[SentinelBench](https://www.microsoft.com/en-us/research/articles/sentinelbench-a-benchmark-for-long-running-monitoring-agents/)**
  (2026-06-08), Microsoft Research. Timed events, passive/active inspection, and
  no-event cases can distinguish justified action from unconditional success
  declarations. Define the observation window. Its artificial event timing and
  persistent conditions bound the claim.
- **[PersonaPlex](https://research.nvidia.com/labs/adlr/personaplex/)**
  (2026-01-15), NVIDIA ADLR. Task adherence, conversation dynamics, and latency
  are distinct. Collect the modality and timing evidence needed for the claim;
  text-only evaluation cannot establish speech interruption quality. The launch
  report is not independent benchmark validation.
- **[Devstral 2](https://mistral.ai/news/devstral-2-vibe-cli/)**
  (2025-12-09), Mistral. Human evaluation under a disclosed product harness
  complements public coding scores. User preference and functional correctness
  remain distinct; a launch report cannot establish universal superiority.
- **[Grok 4.1](https://x.ai/news/grok-4-1)**
  (2025-11-17), xAI. Blind production preference, subjective benchmarks, and
  atomic-claim factuality measure different things. Keep their denominators and
  conditions clear. A preference win or lower error fraction does not automatically
  establish completion or adequate coverage.

## Rubric and judge diagnostics

- **[RIFT](https://arxiv.org/html/2604.01375v2)**
  (v2, 2026-04-20), Snorkel AI and UW–Madison. Review subjective, non-atomic,
  ungrounded, misaligned/rigid, missing, hackable, low-signal, and redundant criteria.
  Diagnose, review, revise, then validate. Its bounded annotation study does not
  make the taxonomy exhaustive; automated diagnosis is weaker on some failure modes.
- **[Judge Reliability Harness](https://arxiv.org/html/2603.05399v1)**
  (2026-03-05), RAND. Distinguish meaning-preserving variations from label-changing
  violations, including multi-turn changes. Review generated controls before use.
  Small, partly synthetic samples support targeted diagnosis, not a universal
  best-judge ranking or automatic installation of another harness.
- **[How to Correctly Report LLM-as-a-Judge Evaluations](https://arxiv.org/html/2511.21140v4)**
  (v4, 2026-05-31), Yonsei, UW–Madison, KRAFTON/Ludo researchers. Judge errors
  can systematically bias an aggregate, and calibration has its own uncertainty.
  Correction requires resolved human labels and stable conditional error rates;
  a small curated set does not justify arbitrary numerical score adjustment.

## Earlier foundations

- **[HCAST](https://metr.org/hcast.pdf)** (METR, 2025), §§2–3, 5 and Appendix B.
  Independent human QA, reference solutions, and inspection of successful and
  failed work reveal incidental difficulty and shortcuts. Human forecasts are
  different from observed baselines; partial-credit averages are not success rates.
- **[Recent Frontier Models Are Reward Hacking](https://metr.org/blog/2025-06-05-recent-reward-hacking/)**
  (METR, 2025-06-05). Protect evaluators and inspect outcomes for shortcuts through
  answer artifacts, clocks, or grading functions. Automated flags need review;
  an unfamiliar valid solution is not necessarily cheating.
- **[MT-Bench and Chatbot Arena judge study](https://arxiv.org/html/2306.05685v4)**
  (v4, 2023-12-24). Position, verbosity, possible self-preference, and reasoning
  limits motivate contextual and bias checks. Reported preference agreement is
  not universal factual accuracy.
- **[JudgeBench](https://arxiv.org/html/2410.12784v2)**
  (v2, 2025-04-05). Subtle factual and logical errors challenge strong judges.
  Validate the judge's domain capability and the source of its labeled pairs;
  confidence, model reputation, and polished reasoning do not establish correctness.
- **[τ-bench](https://arxiv.org/html/2406.12045v1)**
  (2024-06-17). Final-state checking allows varied dialogue and tool paths, while
  separate checks may be needed for policy adherence. Distinguish at-least-one
  success (`pass@k`) from all-k reliability (`pass^k`) and ordinary mean scores.

## Use research as evidence, not a checklist of mandates

- Freeze success criteria while adapting factual inspection to the delivered work.
- Accept varied methods while retaining genuine process constraints.
- Allow partial progress while defining essential conditions and useful delivery.
- Improve realism while preserving the opportunity to exhibit the target behavior.
- Keep controlled comparisons distinct from strongest-elicitation comparisons.
- Use simulations and synthetic controls for the claims they can support.
- Validate grader labels, reasons, stability, and relevance to the target data.
- Propose framework changes explicitly when the required evidence is unsupported.

When updating this guide, inspect original methods, dates, authorship, and
limitations. A community post hosted under a lab's GitHub organization is not
necessarily a lab publication. Search snippets can lag versioned methodology.
Promote a finding into the skill when it changes an authoring decision, not merely
because it introduces a new benchmark or larger score.
