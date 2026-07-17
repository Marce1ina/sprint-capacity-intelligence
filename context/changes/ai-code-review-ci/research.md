---
date: 2026-07-17T18:42:42+02:00
researcher: Marcelina Kucięba
git_commit: ab86596218abb7ac2ab5c9ca240bcb02688986ae
branch: master
repository: sprint-capacity-intelligence
topic: "Wire AI code-review agent into CI for PRs to master"
tags: [research, codebase, code-review, github-actions, cursor-sdk, ci]
status: complete
last_updated: 2026-07-17
last_updated_by: Marcelina Kucięba
---

# Research: Wire AI code-review agent into CI for PRs to master

**Date**: 2026-07-17T18:42:42+02:00
**Researcher**: Marcelina Kucięba
**Git Commit**: ab86596218abb7ac2ab5c9ca240bcb02688986ae
**Branch**: master
**Repository**: sprint-capacity-intelligence

## Research Question

Make the `code-review/` agent work in CI on PRs to master with good CR criteria, structured output, `ai-cr-failed` / `ai-cr-passed` labels, and a PR review comment.

## Summary

A working draft already exists: Cursor SDK agent under `code-review/`, composite action, and `.github/workflows/review.yml` on `pull_request` → `master`. The agent emits Zod-validated JSON (five 1–10 scores + `verdict` + Markdown `summary`) to stdout.

**Not wired yet:** PR labels, posting `summary` as a review comment, failing the check on `verdict=fail`, consuming full JSON in the workflow, injecting project rules (`AGENTS.md` / `CLAUDE.md`), score thresholds, or concurrency/cost guards. Repo secret `CURSOR_API_KEY` (and optional `REVIEW_*` vars) must be configured; Cursor API usage is billed per run.

## Detailed Findings

### Agent package (`code-review/`)

- Thin CLI: `index.ts` → `loadConfig` / `loadReviewRequest` → `ReviewAgent.review` → Zod parse → JSON on stdout ([`code-review/src/index.ts`](https://github.com/Marce1ina/sprint-capacity-intelligence/blob/ab86596218abb7ac2ab5c9ca240bcb02688986ae/code-review/src/index.ts)).
- Uses `@cursor/sdk` local agent with `settingSources: []` (no project Cursor rules loaded) ([`review-agent.ts:15-22`](https://github.com/Marce1ina/sprint-capacity-intelligence/blob/ab86596218abb7ac2ab5c9ca240bcb02688986ae/code-review/src/review-agent.ts#L15-L22)).
- Structured output is **prompt + manual JSON parse**, not SDK native structured output ([`review-schema.ts`](https://github.com/Marce1ina/sprint-capacity-intelligence/blob/ab86596218abb7ac2ab5c9ca240bcb02688986ae/code-review/src/review-schema.ts)).
- Schema fields: `implementationCorrectness`, `idiomaticity`, `complexity`, `testRiskCoverage`, `securitySafety`, `verdict` (`pass`|`fail`), `summary`.
- Score range 1–10 is prompt-only (Zod uses plain `z.number()` intentionally).
- Exit codes: `0` on successful parse **including `verdict: fail`**; `1` startup; `2` run error; `3` parse/schema failure.
- Defaults: model `composer-2.5`, max tool rounds `5`, cwd = monorepo root.
- **No tests** under `code-review/`.
- Not referenced from root `package.json`; documented only in `code-review/README.md`.

### CR criteria — current vs project rules

**Current prompt** ([`review-schema.ts:3-7`](https://github.com/Marce1ina/sprint-capacity-intelligence/blob/ab86596218abb7ac2ab5c9ca240bcb02688986ae/code-review/src/review-schema.ts#L3-L7)): five generic dimensions + LLM-chosen pass/fail. No fail thresholds, no score↔verdict consistency checks, no line-level findings.

**Project rules worth injecting** (from `AGENTS.md` / `CLAUDE.md` / foundation):

| Priority | Rule                                                                  |
| -------- | --------------------------------------------------------------------- |
| High     | Never log/return decrypted tokens or PATs; AES encrypt before storage |
| High     | API routes: `prerender = false`, auth + PAT via `jira-api-context`    |
| High     | Admin/service-role client only in account-delete flow                 |
| High     | Secret-leak / auth-gate / IDOR test patterns for risky paths          |
| Medium   | Astro layout vs React islands; no `"use client"`                      |
| Medium   | `cn()` for conditional classes; hooks in `src/components/hooks/`      |
| Medium   | Colocated Vitest; `vi.mock` before handler imports                    |

Because `settingSources: []`, the agent will **not** auto-load Cursor rules — criteria must be embedded in the prompt or read from disk via tools.

### Composite action + workflow

[`code-review/action.yml`](https://github.com/Marce1ina/sprint-capacity-intelligence/blob/ab86596218abb7ac2ab5c9ca240bcb02688986ae/code-review/action.yml):

1. Checkout with `fetch-depth: 0`
2. `git diff origin/<base>...HEAD` → temp file
3. `npm ci` + `npm run build` in action dir
4. Run agent; `jq` extracts `.verdict` → step/action output

[`review.yml`](https://github.com/Marce1ina/sprint-capacity-intelligence/blob/ab86596218abb7ac2ab5c9ca240bcb02688986ae/.github/workflows/review.yml):

```yaml
on:
  pull_request:
    branches: [master]
  workflow_dispatch:
```

- Triggers include `synchronize` (push to PR) by default — meets “each push to PR” intent.
- Only step is `uses: ./code-review`; no step `id`, so `outputs.verdict` is unused.
- No `permissions:` block.
- No label steps, no PR comment steps, no fail-on-verdict.
- No `concurrency`, path filters, or draft-PR skip.

[`ci.yml`](https://github.com/Marce1ina/sprint-capacity-intelligence/blob/ab86596218abb7ac2ab5c9ca240bcb02688986ae/.github/workflows/ci.yml) remains independent lint+build (Supabase secrets); unrelated to review.

### Gaps vs change goals

| Goal               | Status  | Gap                                                                       |
| ------------------ | ------- | ------------------------------------------------------------------------- |
| CI on PR → master  | Partial | Works; also open/reopen; no draft/path/concurrency guards                 |
| Good CR criteria   | Thin    | Generic five scores; no AGENTS/CLAUDE injection; no thresholds            |
| Structured output  | Exists  | JSON on stdout; workflow keeps only `verdict`; scores/`summary` discarded |
| Labels `ai-cr-*`   | Missing | No label API usage anywhere in repo                                       |
| PR review comment  | Missing | `summary` field ready but never posted                                    |
| Fail check on fail | Missing | Exit 0 on `verdict=fail`                                                  |
| Diff fidelity      | Risk    | No explicit `git fetch origin <base>`; PR head SHA not pinned             |
| Fork PRs           | Risk    | Default token often read-only for labels/comments                         |

### External cost / secrets (lessons.md)

- **Secret:** `CURSOR_API_KEY` (repo secret); optional vars `REVIEW_MODEL`, `REVIEW_MAX_ROUNDS`.
- **Cost:** Cursor API billed per agent run × tool rounds; every PR synchronize + `workflow_dispatch` burns quota. No concurrency group → rapid pushes can stack parallel paid runs.
- Free GitHub Actions minutes ≠ free Cursor API.

## Code References

- `code-review/src/review-schema.ts:3-21` — SYSTEM_PROMPT + Zod schema
- `code-review/src/review-agent.ts:15-91` — SDK agent loop + parse
- `code-review/src/index.ts:17-34` — stdout JSON + exit codes
- `code-review/action.yml:25-88` — composite action (verdict output only)
- `.github/workflows/review.yml:1-16` — PR workflow stub
- `.github/workflows/ci.yml:1-25` — separate lint/build CI
- `AGENTS.md` / `CLAUDE.md` — project conventions to inject
- `context/foundation/lessons.md:5-9` — surface external API cost early

## Architecture Insights

1. **Separation of concerns:** Agent package should stay focused on review → JSON; GitHub side effects (labels, comments, check failure) belong in the workflow or action post-steps using `GITHUB_TOKEN`.
2. **Verdict must be a first-class CI signal:** either fail the action step when `verdict=fail`, or map to labels + optional required check.
3. **`summary` is already shaped as a PR comment** — posting is glue, not agent redesign.
4. **Criteria quality** is mostly prompt/content work: inject AGENTS/CLAUDE excerpts (or a dedicated `code-review/criteria.md`) and optionally add programmatic thresholds / findings array later.
5. **CI vs review:** Keep `ci.yml` lint+build; do not block deploy pipeline on Cursor (deploy is Cloudflare Workers Builds per roadmap).

## Historical Context (from prior changes)

- `context/changes/ai-code-review-ci/change.md` — only change targeting this work; status was `new` at research start.
- No archive entries for Cursor SDK / automated PR review.
- Related CI decisions: GitHub Actions stay lint+build; deploy via Cloudflare (`context/foundation/roadmap.md`, `context/changes/deployment/deploy-plan.md`).
- Archive impl-reviews (e.g. integration-token-store, testing-security-critical-paths) surface security patterns worth encoding as CR criteria: token leakage, auth gates, IDOR.

## Related Research

None prior under `context/changes/**/research.md` or `context/archive/**/research.md` for this topic.

## Open Questions

1. Should `verdict=fail` fail the GitHub check (block merge if required), or only apply labels + comment?
2. Label strategy: create labels if missing? Toggle both labels (remove opposite)? Who owns label creation in the org?
3. Comment shape: single issue comment, sticky comment (edit in place), or formal `pull_request_review` (APPROVE/REQUEST_CHANGES/COMMENT)?
4. How deep should project criteria go in v1 — short criteria.md vs full AGENTS.md dump?
5. Fork PR policy: skip review, use `pull_request_target` (risky), or require PAT/app token?
6. Confirm `CURSOR_API_KEY` is already set as a repo secret (workflow will fail without it).
7. Should scores appear in the PR comment body (table) or stay internal to JSON?
