---
date: 2026-07-17T19:52:38+02:00
researcher: Marcelina Kucięba
git_commit: 6930a1762a27b5b6d2d0795ad58bc632d9c6bcc1
branch: master
repository: sprint-capacity-intelligence
topic: "Promptfoo eval suite to compare CR agent models on fixed diffs (pass/fail + cost + latency) and gate prompt regressions"
tags: [research, codebase, code-review, promptfoo, eval, cursor-sdk, model-comparison]
status: complete
last_updated: 2026-07-17
last_updated_by: Marcelina Kucięba
---

# Research: Promptfoo eval suite for CR agent model comparison

**Date**: 2026-07-17T19:52:38+02:00
**Researcher**: Marcelina Kucięba
**Git Commit**: 6930a1762a27b5b6d2d0795ad58bc632d9c6bcc1
**Branch**: master
**Repository**: sprint-capacity-intelligence

## Research Question

How should we build a small Promptfoo suite on the same diffs, run 2–3 models side by side, and use a hard results matrix (pass/fail plus cost and latency) to choose cheaper vs more expensive models — then keep that suite as a regression gate before further prompt changes?

## Summary

The `code-review/` package is a thin Cursor SDK CLI: env supplies a precomputed diff, `buildReviewPrompt()` merges `SYSTEM_PROMPT` + `criteria.md` + diff + JSON instructions, and `ReviewAgent` runs a local agent (default `composer-2.5`, max 5 tool rounds) that emits Zod-validated JSON on stdout. CI review is **advisory** (labels/comments; `verdict=fail` does not fail the job).

There is **no Promptfoo config, no golden diffs, no agent tests, and no cost/latency instrumentation** today. A model-comparison suite must wrap the real prompt path (or the full agent), pin fixture diffs, assert primarily on `verdict` + schema validity, and add wall-clock + usage capture. The natural regression gate is a **dedicated local script and/or separate CI workflow** on prompt/criteria paths — not pre-commit and not the per-PR advisory `review.yml` job.

**Implicit cost (lesson prior):** every eval run bills the Cursor API (`CURSOR_API_KEY` / team plan) per agent run × tool rounds. Multi-model × multi-fixture matrices multiply cost; keep the suite small and path-filtered.

## Detailed Findings

### Agent I/O and prompt stack

- Entry: [`code-review/src/index.ts`](https://github.com/Marce1ina/sprint-capacity-intelligence/blob/6930a1762a27b5b6d2d0795ad58bc632d9c6bcc1/code-review/src/index.ts) — loads config + request, runs agent, writes `ReviewOutput` JSON to stdout; exit 1/2/3 for startup / run / parse errors.
- Diff inputs: `REVIEW_DIFF_FILE` or `REVIEW_DIFF` ([`cli.ts`](https://github.com/Marce1ina/sprint-capacity-intelligence/blob/6930a1762a27b5b6d2d0795ad58bc632d9c6bcc1/code-review/src/cli.ts)); optional `REVIEW_PR_TITLE` / `REVIEW_PR_BODY`.
- Model: `REVIEW_MODEL` → default `composer-2.5` ([`config.ts`](https://github.com/Marce1ina/sprint-capacity-intelligence/blob/6930a1762a27b5b6d2d0795ad58bc632d9c6bcc1/code-review/src/config.ts)); passed as `Agent.create({ model: { id } })` ([`review-agent.ts`](https://github.com/Marce1ina/sprint-capacity-intelligence/blob/6930a1762a27b5b6d2d0795ad58bc632d9c6bcc1/code-review/src/review-agent.ts)).
- Prompt assembly order ([`prompts.ts`](https://github.com/Marce1ina/sprint-capacity-intelligence/blob/6930a1762a27b5b6d2d0795ad58bc632d9c6bcc1/code-review/src/prompts.ts)): `SYSTEM_PROMPT` → project criteria from [`criteria.md`](https://github.com/Marce1ina/sprint-capacity-intelligence/blob/6930a1762a27b5b6d2d0795ad58bc632d9c6bcc1/code-review/criteria.md) → diff block → output instructions ([`review-schema.ts`](https://github.com/Marce1ina/sprint-capacity-intelligence/blob/6930a1762a27b5b6d2d0795ad58bc632d9c6bcc1/code-review/src/review-schema.ts)).
- `settingSources: []` — Cursor rules / AGENTS.md / MCP are **not** auto-loaded; only embedded criteria + tools against `REVIEW_CWD`.
- Output schema: five 1–10 scores, `verdict: pass|fail`, Markdown `summary`. **No programmatic score thresholds or score↔verdict consistency checks** — pass/fail is LLM-chosen.
- Agent may read the repo on disk (“do not re-run git diff”). Tool rounds capped at `REVIEW_MAX_ROUNDS` (default 5); cancel + partial parse can yield exit 3.

### What exists vs what the eval needs

| Need                                   | Current state                                     |
| -------------------------------------- | ------------------------------------------------- |
| Fixed golden diffs                     | None — CI always uses live `origin/<base>...HEAD` |
| Expected verdicts                      | None                                              |
| Multi-model runner                     | Single `REVIEW_MODEL` per process                 |
| Cost / latency                         | Not captured; SDK `usage` unused                  |
| Promptfoo / tests under `code-review/` | None                                              |
| Regression gate for prompts            | Deferred by design in prior CI wiring change      |

### Promptfoo provider options

1. **Production-faithful (recommended for regression gate):** wrap `buildReviewPrompt` + `ReviewAgent.review` with env-set `REVIEW_MODEL`, fixture `diff`, pinned `REVIEW_CWD`. Assert `verdict`, schema, optionally score floors on security fixtures. Capture `latencyMs` + `result.usage` (requires small agent patch — not present today).
2. **Prompt-only:** send assembled prompt to raw LLM APIs without tools — more apples-to-apples across vendors, **diverges from CI** (no tool use / repo reads).

### CI and where to hang the gate

- Advisory PR review: [`.github/workflows/review.yml`](https://github.com/Marce1ina/sprint-capacity-intelligence/blob/6930a1762a27b5b6d2d0795ad58bc632d9c6bcc1/.github/workflows/review.yml) → [`code-review/action.yml`](https://github.com/Marce1ina/sprint-capacity-intelligence/blob/6930a1762a27b5b6d2d0795ad58bc632d9c6bcc1/code-review/action.yml); model from `vars.REVIEW_MODEL`; secret on **PRD** environment.
- `ci.yml` only `npm ci`s `code-review/` — no agent run.
- **Best gate:** local `npm run eval` under `code-review/` + optional dedicated workflow (path-filter on `criteria.md`, `prompts.ts`, `review-schema.ts`, `load-criteria.ts`), **not** pre-commit and **not** multiplying cost inside per-PR `review.yml`.

### Files a regression gate should protect

- `code-review/criteria.md`
- `code-review/src/review-schema.ts` (`SYSTEM_PROMPT`, output instructions, Zod schema)
- `code-review/src/prompts.ts`
- Secondary: `review-agent.ts` (round cap), `config.ts` (defaults)

### Fixture design hints (from criteria + history)

Golden diffs should cover project hard rules: token/PAT leakage, plaintext credentials, missing auth on Jira routes, service-role misuse, Astro/React stack violations — so models are scored on **recall of project-specific failures**, not generic taste.

### Suggested matrix shape

`model × fixture → verdict, schema_ok, latencyMs, inputTokens, outputTokens, toolRounds, status`

Compare 2–3 models including baseline `composer-2.5`. No historical shortlist of alternate models exists.

## Code References

- `code-review/src/index.ts:5-34` — CLI entry, stdout JSON, exit codes
- `code-review/src/cli.ts:41-61` — diff/env request loading
- `code-review/src/config.ts:9-44` — `CURSOR_API_KEY`, `REVIEW_MODEL` default `composer-2.5`, max rounds
- `code-review/src/review-agent.ts:12-91` — Cursor SDK create/send/stream/wait, tool-round cancel
- `code-review/src/prompts.ts:5-42` — prompt assembly + disk-context instruction
- `code-review/src/review-schema.ts:3-93` — system prompt, Zod schema, JSON extract/parse
- `code-review/src/load-criteria.ts:11-27` — fail-loud criteria load
- `code-review/criteria.md:1-25` — hard rules for scoring/verdict
- `code-review/action.yml:44-102` — CI diff prep + env mapping
- `.github/workflows/review.yml:3-133` — advisory PR review workflow

## Architecture Insights

- Eval assertions should target **schema validity + expected `verdict`**, not invented score cutoffs (production has none).
- Full-fidelity evals inherit **tool-use non-determinism** and require **repo checkout pinned to the commit the diff was generated against**.
- Parse failures and round-cap cancels are first-class failure modes (exit 3) distinct from `verdict=fail`.
- Cost awareness already shaped CI (concurrency cancel); evals must make cost/latency **visible columns**, not dashboard guesswork.
- Separating advisory PR review from a blocking eval gate avoids flaky merge blocks while still protecting prompt edits.

## Historical Context (from prior changes)

- `context/archive/2026-07-17-ai-code-review-ci/` — shipped the agent + advisory CI; explicitly **out of scope**: native structured output, score thresholds, line-level findings, agent test suite.
- Plan-brief: fail-on-`verdict=fail` rejected to avoid merge blocks from flaky LLM judgment.
- Impl-review noted max-rounds cancel → partial parse → exit 3 can red the workflow even in advisory mode.
- `context/changes/cr-agent-eval/change.md` — first explicit Promptfoo / multi-model matrix intent; nothing implemented yet.
- Lesson (`context/foundation/lessons.md`): surface implicit external-service cost before scoping — applies to Cursor API eval matrices.

## Related Research

- [`context/archive/2026-07-17-ai-code-review-ci/research.md`](../archive/2026-07-17-ai-code-review-ci/research.md) — original CR agent + CI research
- [`context/archive/2026-07-17-ai-code-review-ci/plan.md`](../archive/2026-07-17-ai-code-review-ci/plan.md) — implementation plan and out-of-scope list

## Open Questions

1. Which 2–3 model IDs to compare against `composer-2.5` (Cursor catalog / team billing)?
2. Production-faithful agent eval vs prompt-only provider (or both: agent for regression gate, prompt-only for cross-vendor)?
3. How many fixtures for MVP (e.g. 3–5: known-pass, secret leak, missing auth, empty diff)?
4. Should cost come from SDK `usage` tokens only, or also wall-clock + external pricing table?
5. Eval CI: manual `workflow_dispatch` only vs auto on prompt-path PRs (blocking)?
6. Where to store fixtures (committed `.diff` under `code-review/eval/fixtures/` vs generated from known commits)?
