<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: AI Code Review CI

- **Plan**: context/changes/ai-code-review-ci/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-07-17
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 4 warnings 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — criteria.md omits `prerender = false`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: code-review/criteria.md:11-14
- **Detail**: Plan Phase 1 minimum hard-rule list requires API routes to use `prerender = false`. Auth/PAT/jira-api-context rules are present; `prerender = false` is absent. Automated Progress 1.1 claims hard-rule themes covered.
- **Fix**: Add a bullet under Auth and API routes: `API routes must export const prerender = false`.
- **Decision**: SKIPPED

### F2 — AGENTS/CLAUDE omit PRD environment for CURSOR_API_KEY

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: AGENTS.md:71; CLAUDE.md:101; .github/workflows/review.yml:20
- **Detail**: Workflow binds `environment: PRD` (commit 21b5dfd). `code-review/README.md` correctly says the secret must live on the PRD environment. AGENTS.md / CLAUDE.md still say only “Requires `CURSOR_API_KEY`”, which implies a repo-level secret and can cause silent CI misconfiguration. Violates the hosted-environment checklist lesson spirit for agent-facing docs.
- **Fix**: Update both CI blurbs to say `CURSOR_API_KEY` must be set on the **PRD** GitHub Environment (and point at `code-review/README.md` for the full checklist).
- **Decision**: FIXED

### F3 — Fixed `EOF` heredoc for multiline summary output

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: code-review/action.yml:90-94
- **Detail**: Action writes `summary` to `$GITHUB_OUTPUT` with a fixed `EOF` delimiter. A model summary containing a lone `EOF` line can truncate/corrupt the action output and break the comment step.
- **Fix**: Use a unique delimiter (e.g. `EOF_${GITHUB_RUN_ID}_${RANDOM}`) for the multiline output block.
- **Decision**: SKIPPED

### F4 — Unplanned ops extras (PRD env, CI deps, eslint, empty REVIEW_MODEL)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: .github/workflows/review.yml:20; .github/workflows/ci.yml; eslint.config.js; code-review/src/config.ts
- **Detail**: Core Phase 1–3 deliverables match the plan. Extra changes landed outside “Changes Required”: `environment: PRD`, `ci.yml` `npm ci` in `code-review/`, eslint `no-console` override for `code-review/**`, and empty-`REVIEW_MODEL` defaulting. All look like necessary CI/ops fixes discovered during smoke; smoke fodder was cleaned in epilogue. Scope guardrails (“NOT Doing”) were not violated.
- **Fix A ⭐ Recommended**: Document the extras as a short plan addendum (PRD env + CI lint install + empty-var defaults) so the plan matches HEAD.
  - Strength: Keeps plan as ground truth for archive/status; preserves working ops fixes.
  - Tradeoff: Plan becomes a slight moving target after implementation.
  - Confidence: HIGH — extras already documented in README for PRD; addendum is bookkeeping.
  - Blind spot: Whether stakeholders care about PRD-vs-repo-secret wording in the original plan.
- **Fix B**: Revert extras that are not strictly required (keep empty-`REVIEW_MODEL` + CI install; drop or rethink `environment: PRD` if repo secrets were the intended model).
  - Strength: Closer to original plan wording (“repo secret”).
  - Tradeoff: May break the working smoke setup that relies on PRD secrets.
  - Confidence: LOW — live GH Environments config not verified from this review.
  - Blind spot: Whether `CURSOR_API_KEY` exists only on PRD today.
- **Decision**: SKIPPED

### F5 — Criteria load fails mid-review (exit 2), not at config startup

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: code-review/src/prompts.ts:6; code-review/src/load-criteria.ts:11-25; code-review/src/index.ts:13-33
- **Detail**: Plan said failure to load criteria should fail startup clearly via the config-error exit path. Loader throws correctly (no silent fallback), but load runs inside `buildReviewPrompt()` during `review()`, mapping to generic exit 2 rather than config exit 1. Behavior is still fail-loud.
- **Fix**: Call `loadProjectCriteria()` from `loadConfig()` (or `main` before `agent.review`) so missing criteria exits as a startup/config error.
- **Decision**: SKIPPED

### F6 — Latent `base-ref` shell interpolation in composite action

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: code-review/action.yml:49-58
- **Detail**: `base-ref` input is interpolated into bash for `git fetch` / `git diff`. Current `review.yml` does not pass `base-ref` (defaults to github.base_ref / master), so risk is latent for action reuse. Not exploitable via fork PRs with the current workflow (forks skip the job).
- **Fix**: Allowlist `base-ref` with `^[A-Za-z0-9._/-]+$` before fetch/diff.
- **Decision**: SKIPPED

### F7 — Round-cap cancel can still red the advisory check (pre-existing agent)

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: code-review/src/review-agent.ts:67-90
- **Detail**: `review-agent.ts` was not edited in this change, but it interacts with the new advisory contract: hitting `REVIEW_MAX_ROUNDS` cancels the run then `finalizeReview` still parses partial stdout; parse failure → exit 3 → red workflow. So cost-cap paths can fail the check even when `verdict=fail` would stay green.
- **Fix A ⭐ Recommended**: On round-cap cancel, emit a structured fallback JSON (`verdict: fail` + fixed summary) instead of parsing partial text.
  - Strength: Preserves green advisory check + comment/labels under cost caps.
  - Tradeoff: Touches pre-existing agent code outside original phase file list.
  - Confidence: MEDIUM — need to confirm cancel path always leaves incomplete JSON today.
  - Blind spot: How often max-rounds is hit in practice with default 5.
- **Fix B**: Leave agent as-is; document that round-cap / parse errors are hard failures by design.
  - Strength: No code change; matches “fail only when agent cannot produce valid JSON”.
  - Tradeoff: Operators may confuse cost-cap reds with infra outages.
  - Confidence: HIGH — aligns with plan’s “fail on parse/run errors” wording.
  - Blind spot: None significant.
- **Decision**: SKIPPED
