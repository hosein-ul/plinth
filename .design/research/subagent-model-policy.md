# Subagent model policy: research notes

Scope: how Anthropic documents choosing the Claude model for subagents and task types in Claude Code and the Claude Agent SDK, optimised for token cost with acceptable quality.

Tags: **[documented]** = stated in a fetched Anthropic page (URL given). **[inference]** = my reading or recommendation, not stated by Anthropic.

Sources fetched (2026-10-11):
- S1 Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- S2 Claude Code model configuration: https://code.claude.com/docs/en/model-config
- S3 Claude Code cost management: https://code.claude.com/docs/en/costs
- S4 Agent SDK subagents: https://code.claude.com/docs/en/agent-sdk/subagents
- S5 Anthropic engineering, multi-agent research system: https://www.anthropic.com/engineering/multi-agent-research-system
- S6 Anthropic engineering, Building effective agents: https://www.anthropic.com/engineering/building-effective-agents
- S7 Prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching

Note on sources: the docs.claude.com URL redirects to platform.claude.com and code.claude.com. The Claude Code docs are now on code.claude.com. The fetched page text was truncated on long pages, so later sections (for example the full env var list) were not read.

---

## 1. Model field on subagents and built-in agents

**Accepted values.** [documented, S1, S4] The `model` field accepts the aliases `sonnet`, `opus`, `haiku`, `fable`, a full model ID (for example `claude-opus-5-5`), or `inherit`. Omitting it means "resolve by the order below". The Agent SDK `AgentDefinition.model` takes the same values (alias, full ID, or `inherit`). [documented, S4]

**Resolution order.** [documented, S1, S2] For a subagent's model:
1. The per-invocation `model` parameter Claude passes when it starts the subagent.
2. The subagent's `model` frontmatter (`inherit` = main conversation's model).
3. The `CLAUDE_CODE_SUBAGENT_MODEL` environment variable.
4. The main conversation's model.

Note: a pre-2.1.251 build ranked the env var first (S1). Check your Claude Code version when debugging "why is my haiku subagent running on Opus".

**Forcing one model.** [documented, S1, S2] `CLAUDE_CODE_SUBAGENT_MODEL` is only a default. Setting `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` as well (v2.1.257+) makes every subagent use that model and ignores `model` fields. With only the `_FORCE` variable set, subagents use the main model, except the built-in Explore.

**Alias resolution.** [documented, S2] `opus`, `sonnet`, `haiku` point to different model versions per provider. On the Anthropic API they resolve to Opus 5.5, Sonnet 5.5, Haiku 5.5. On other providers (Bedrock, Vertex/Google, Foundry, Claude Platform on AWS) some resolve to older versions. Full IDs pin a version. `ANTHROPIC_DEFAULT_HAIKU_MODEL` also controls the model used for `haiku` and for background work [documented, S2].

**Built-in subagents.** [documented, S1] The fetched table says:

| Agent | Model (per S1) | Notes |
|---|---|---|
| Explore | Main conversation's model (on Anthropic subscription/Console/gateway, the Opus alias when main is Fable; cloud providers keep main model) | Read-only. Override by defining a custom `Explore` agent with `model: haiku`. |
| Plan | Inherits main model unless forced | Read-only, used in plan mode. |
| general-purpose | `CLAUDE_CODE_SUBAGENT_MODEL` if set and nothing else assigns a model; otherwise main model | Full subagent tool set. |
| statusline-setup | Sonnet | `/statusline`. |
| claude-code-guide | Haiku | Questions about Claude Code. |

Conflict to flag: third-party guides (not Anthropic) say Explore runs on Haiku by default. The fetched official page says Explore inherits the main model. [inference] Trust S1 and verify with `/agents` or the version you run. The safe pattern is to pin Explore yourself (see section 5).

**Subagents inherit thinking settings.** [documented, S1] Subagents also inherit the main conversation's extended thinking setting. Fork mode is on by default in interactive sessions and off in `-p` and SDK (S1).

**Tool restriction as a cost lever.** [documented, S1, S4] `tools` limits what a subagent can call; omitting it grants every subagent tool. `disallowedTools` is applied first. Read-only research agents should get `Read, Grep, Glob` (and `Bash` only if needed). [inference] Fewer tool definitions also means a smaller prompt.

**Explicit guidance on cost per model.** [documented, S3] "Sonnet handles most coding tasks well and costs less than Opus. Reserve Opus for complex architectural decisions or multi-step reasoning." Also: "For simple subagent tasks, specify `model: haiku`." The Agent SDK example pins `model: "sonnet"` on a code reviewer and uses `opus` only for a "strict" security mode, as an example of "use a more capable model for high-stakes reviews" [documented, S4].

**Fable.** [documented, S2] `fable` is the most capable tier, "for work larger than a single sitting", not the default on any plan, and may bill to usage credits. Safety classifiers (mainly cyber and bio) can fall back to Opus. Fable 5.1 needs Claude Code v2.1.257+.

---

## 2. Orchestrator-worker and multi-agent economics

**Pattern.** [documented, S6] The orchestrator "dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results". Use it when subtasks cannot be predicted in advance. Anthropic's advice is to use the simplest thing that works, and to optimise single calls first.

**Cheap-worker / strong-lead split.** [documented, S5] The research system used Claude Opus 4 as lead and Claude Sonnet 4 subagents. It beat single-agent Opus 4 by 90.2% on an internal research eval. [documented, S6] The routing pattern sends easy queries to smaller models (Haiku 4.5 example) and hard ones to more capable models.

**Token multipliers.** [documented, S5] "agents typically use about 4x more tokens than chat interactions, and multi-agent systems use about 15x more tokens than chats." Token usage alone explained about 80% of variance in performance on BrowseComp, with tool-call count and model choice the other two factors (S5). The implication is that multi-agent work is spent tokens, not free quality.

**Agent teams.** [documented, S3] Teams use about 7x more tokens than a standard session when teammates run in plan mode (S3). Anthropic says to use Sonnet for teammates, keep teams small, keep spawn prompts focused, and shut teammates down when done.

**When parallel subagents pay off.** [documented, S5] Worth it when task value is high, when work is heavily parallelisable, when information exceeds one context window, and when many tools are involved. Poor fit when agents must share the same context or have many dependencies. S5 says "most coding tasks involve fewer truly parallelizable tasks than research". Lead agent spun up 3-5 subagents in parallel; subagents used 3+ tools in parallel, which cut research time by up to 90% for complex queries.

**Anthropic's own caveats.** [documented, S6] Agents trade latency and cost for performance, and compounding errors are a risk; test in sandboxes. [documented, S5] Agents are not yet strong at real-time coordination.

**Limits you can set.** [documented, S4] `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (default 3), `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (default 20), and `maxBudgetUsd` / `max_budget_usd` in the SDK. For a cost-bounded run, set depth to 1 and concurrency to 3-5.

**Cost spread of a subagent.** [documented, S1] Subagent requests count toward the same usage as the main conversation, and many subagents returning long reports consume context in the main conversation too. Keep subagent reports short.

---

## 3. Task type to model tier (what Anthropic recommends)

Anthropic's docs do not publish one table with these exact three tiers. The mapping below combines the documented statements:

- **Smallest (Haiku)** [documented, S1, S2, S3]: "simple, fast tasks"; "cheap, well-defined work"; Explore-style search; "file discovery, code search, codebase exploration"; test output and log processing (isolated in a subagent so only a summary returns).
- **Mid (Sonnet)** [documented, S2, S3, S4]: "daily coding", "most coding tasks", feature implementation with a clear scope; code review and test running in SDK examples; agent-team teammates.
- **Strongest (Opus / Fable)** [documented, S2, S3, S4]: "complex reasoning", "complex architectural decisions or multi-step reasoning", "root-cause investigations", "outage debugging", "architecture decisions", "long autonomous sessions" (Fable).

Summarisation and classification are not named explicitly in Anthropic's model docs. [inference] They fall to Haiku when the input is bounded, and to Sonnet when judgement is needed.

---

## 4. Prompt caching and context isolation

**Cache economics.** [documented, S7] Cache read is 0.1x base input for most models, and 0.05x for Opus 5.5 and Sonnet 5.5, 0.025x for Fable 5.1. Cache write is 1.25x (5-minute TTL) or 2x (1-hour TTL). Minimum cacheable prompt is 512 tokens for Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.1 and Fable 5; shorter prompts are not cached and raise no error. Default cache lifetime is 5 minutes, refreshed on each use; 1-hour is available at extra cost.

**Subagent caches are separate.** [documented, S1] A fork shares the parent's prompt cache because its system prompt and tools are identical, so it costs less than a fresh subagent for tasks that need the same context. A non-fork subagent has its own cache. `experimental.cacheTtl` (`5m` or `1h`) sets cache lifetime per subagent (v2.1.248+). [documented, S7] Caches are isolated per workspace (API) or per organisation (Bedrock/Google).

**Context isolation.** [documented, S1, S4] A subagent starts with its own system prompt and basic environment, not the Claude Code system prompt. It loads CLAUDE.md and a git snapshot unless `omitClaudeMd: true` (custom agents) or it is Explore/Plan. Only the Agent tool prompt string passes in, so put file paths and error text in that prompt. Only the final message returns to the parent.

**Cost tips documented by Anthropic.** [documented, S3]
- Use `/clear` between unrelated tasks; `/compact` costs a large request itself.
- Keep CLAUDE.md under about 200 lines; move workflow-specific instructions into skills (loaded on demand).
- Use hooks to pre-filter verbose output (for example only failing test lines) before it reaches context.
- Delegate verbose operations (tests, docs, logs) to subagents so only a summary returns.
- Lower effort (`low`/`medium`) for cost-sensitive tasks; `/effort` or the `effort` frontmatter field on a subagent.
- Keep subagent `description` fields short; combined descriptions above about 15,000 tokens trigger a startup warning (S1).
- Cache misses happen after idle gaps longer than the TTL; a 1-hour TTL helps long sessions.

**Effort levels.** [documented, S2] `low` for small changes; `medium` for day-to-day work and cost-sensitive tasks; `high` where verification matters (bug fixes in existing code); `xhigh`/`max` for hard problems with diminishing returns. Opus 5.5 defaults to `medium`, and Anthropic says Opus 5.5 at medium matches or beats Opus 5 at high. Sonnet 5.5 defaults to `medium`.

---

## 5. Claude 5 family (documented in S2)

| Model | ID | Positioning (Anthropic's words, paraphrased) |
|---|---|---|
| Fable 5.1 (and Fable 5) | `claude-fable-5-1`, `claude-fable-5` | Most capable. Long autonomous sessions, ambiguous problems, root-cause work, outage debugging, architecture. Not the default; select with `/model fable`. Tip: describe the outcome, not the steps. |
| Opus 5.5 | `claude-opus-5-5` | Complex reasoning. Defaults to `medium` effort. |
| Sonnet 5.5 | `claude-sonnet-5-5` (alias `sonnet`) | Daily coding; clear-scope feature work. Defaults to `medium`. |
| Haiku 5.5 | `claude-haiku-5-5` | Simple, fast tasks. 1M context on the API but costs more per token above 100K-token prompts. |

Pricing for the Claude 5 models was not in the fetched pages, so no dollar figures are given here. [inference] Use the Anthropic pricing page before writing numeric budgets.

---

## 6. Recommended policy (for this project)

Rules that follow from the sources:

1. **Orchestrator** stays on the strongest model you are willing to pay for (Opus 5.5 by default; Fable only for long or ambiguous work). [documented principle, S5/S6]
2. **Workers** default to Sonnet 5.5; use Haiku 5.5 for bounded search, reading and summarising. [documented, S1-S3]
3. **Pin explicitly.** Set `model:` in every custom subagent; do not rely on `inherit`, because a subagent otherwise runs on whatever the main session model is. [documented, S2, S3]
4. **Pin Explore** with `model: haiku` (custom `Explore` agent) to avoid the main-model default. [documented override, S1]
5. **Do not force a model** with `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` unless you want to override per-agent choices; it also ignores `model` fields. [documented, S1]
6. **Parallelise only** independent read/research work (3-5 subagents), not tightly coupled code edits. [documented, S5]
7. **Set spend and depth caps** for SDK runs. [documented, S4]
8. **Keep reports short** and isolate verbose output. [documented, S1, S3]
9. [inference] Your personal memory rule says subagents run on Sonnet or Haiku only, never Opus. This is consistent with the table below if you keep Opus for the orchestrator/main thread and do not spawn Opus subagents. Confirm this is the intent before escalating a worker to Opus.

---

## 7. ROUTING TABLE (proposed)

Columns: task type, recommended model, why, when to escalate.

| Task type | Recommended model | Why | When to escalate |
|---|---|---|---|
| File and code search, Explore, "where is X" | Haiku 5.5 (`model: haiku` on Explore) | Documented as Haiku's job; read-only, bounded output | Results contradict each other or the answer needs reasoning across many modules: re-run the same question on Sonnet 5.5 |
| Reading logs, test output, long docs, returning a summary | Haiku 5.5 | Bounded input, summary output; isolates context from the main thread | Summary omits the failure cause or the output is code-level judgement: switch to Sonnet 5.5 |
| Summarisation of already-retrieved text | Haiku 5.5 | Cheap, mechanical | Long input above about 100K tokens (Haiku costs more per token there) or nuanced synthesis: Sonnet 5.5 |
| Classification, tagging, extraction to a fixed schema | Haiku 5.5 | Cheap, well-defined | Low agreement on a labelled sample, or ambiguous categories: Sonnet 5.5 |
| Mechanical edits (rename, format, move, boilerplate from a template) | Haiku 5.5 with tight `tools` list | Deterministic; verify with tests or a diff review | Edit touches logic or types, or tests fail twice: Sonnet 5.5 |
| Feature implementation with clear scope, most coding | Sonnet 5.5 (`effort: medium`) | Documented default for daily coding | Cross-file design change, unclear requirements, or repeated failing tests: Opus 5.5 `high` |
| Code review (quality, correctness, tests) | Sonnet 5.5 | Documented mid-tier use; SDK example pins Sonnet for reviewers | Security-critical or payment/crypto code paths: Opus 5.5 (ask the user first, per the memory rule) |
| Test writing and running | Sonnet 5.5 | Needs Bash and judgement on failures | Flaky or environment-level failures: Opus 5.5 |
| Planning, architecture, design docs | Opus 5.5 (main thread) | Documented for architecture and multi-step reasoning | Very large or long-running programmes with many unknowns: Fable 5.1 (usage credits may apply) |
| Hard debugging, root cause, outages | Opus 5.5 at `high` | Documented for root-cause investigations | Still unresolved after two Opus passes or spans many services: Fable 5.1 |
| Final judgement, release decisions, conflicting reviews | Opus 5.5 (main thread) | Strongest reasoning should sit with the orchestrator, not a worker | Only if stakes are very high: Fable 5.1 |
| Parallel research fan-out (3-5 workers) | Lead: Opus 5.5; workers: Sonnet 5.5 or Haiku 5.5 | Documented lead/worker split (S5); about 4-15x tokens vs chat | Budget cap hit or results overlap: reduce workers to 1-2 or stop |

Cost checklist (applies to every row):
- Pin `model:` on every subagent; set `tools:` to the minimum.
- Keep reports short; put verbose output in a subagent, not the main thread.
- Run `/clear` between unrelated tasks; keep CLAUDE.md short.
- For SDK runs, cap depth, concurrency and `max_budget_usd`.
- Verify pricing for Claude 5 models on the Anthropic pricing page before setting numeric budgets (not covered by the fetched sources).
