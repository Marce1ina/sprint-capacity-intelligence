<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: CR Agent Eval (Promptfoo Model Matrix)

- **Plan**: context/changes/cr-agent-eval/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-07-17
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — `resolveMaxRounds` throws outside provider try/catch

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: code-review/eval/provider.ts:68
- **Detail**: `resolveMaxRounds(this.config.maxRounds)` runs after the fixture `try/catch` and before the agent-review `try/catch`. Invalid `REVIEW_MAX_ROUNDS` or `config.maxRounds` throws an uncaught error instead of returning `{ error: ... }`, so Promptfoo can crash with a stack trace rather than a structured test failure. Default path (undefined + unset env) is fine; only bad config/env hits this.
- **Fix**: Move `resolveMaxRounds` inside the existing review `try/catch` (or wrap it and map to `{ error: ... }`).
- **Decision**: FIXED

### F2 — README Node prerequisite contradicts `.nvmrc` / Promptfoo floor

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: code-review/README.md:11
- **Detail**: README says Node **22.13+** (see repo `.nvmrc`), but `.nvmrc` is `22.22.0` and Promptfoo requires `^20.20 || >=22.22`. Local eval can fail on 22.13–22.21 even though docs suggest those versions are fine. CI correctly pins `22.22`.
- **Fix**: Change the prerequisite to **22.22+** (or “match repo `.nvmrc`”).
- **Decision**: FIXED — match repo `.nvmrc` (with Promptfoo `>=22.22` note)

### F3 — Dry verdict-mismatch check is not `npm run eval`

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: code-review/package.json (scripts `eval` / `eval:assert-check`)
- **Detail**: Plan success criterion 2.1 said `npm run eval` exits non-zero on deliberate expected-verdict mismatch. Implementation uses a separate dry script `npm run eval:assert-check` (passes locally; no Cursor API). Intent is met; wording drifted. CI only runs the live matrix.
- **Fix**: Document in README that 2.1 is covered by `eval:assert-check`, or optionally run that script as a CI preflight before `npm run eval`.
- **Decision**: SKIPPED

### F4 — Promptfoo `maxConcurrency: 4` vs plan “serial is fine”

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: code-review/eval/promptfooconfig.mjs:49
- **Detail**: Plan Performance section said serial Promptfoo is fine for MVP and not to fan out unless cost is acceptable. Implementation sets `maxConcurrency: 4` (commit `c744162`). README correctly notes run count (~12) is the same billed cost; wall-clock only changes. Not a guardrail violation.
- **Fix**: No code change required unless rate limits appear — keep as documented tuning knob.
- **Decision**: ACCEPTED — intentional; documented tuning knob, no code change

### F5 — Agent docs omit blocking `cr-eval.yml`

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: AGENTS.md / CLAUDE.md (CI sections)
- **Detail**: Both docs describe advisory `review.yml` but not the new path-filtered blocking eval gate. Full checklist lives in `code-review/README.md` only. Easy for agents/humans to miss spend/trigger rules.
- **Fix**: Add a short CI blurb for `cr-eval.yml` (path-filtered, blocking, PRD `CURSOR_API_KEY`, ~12 runs) next to the existing `review.yml` entry.
- **Decision**: FIXED

## Automated verification (re-run)

| Check                                                                      | Result                                                                                       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm run typecheck` (cwd `code-review`)                                    | PASS                                                                                         |
| Fixtures with `expectedVerdict` (≥3)                                       | PASS — 4 fixtures (`pass-benign`, `fail-secret-leak`, `fail-auth-gate`, `fail-service-role`) |
| `npm run eval:assert-check`                                                | PASS                                                                                         |
| `.github/workflows/cr-eval.yml` path filters + artifact + fork guard + PRD | PASS                                                                                         |
| Advisory `review.yml` unchanged (not in change diff)                       | PASS                                                                                         |

## Manual progress (plan)

All Phase 1–3 manual Progress items are `[x]` with SHAs (`f457815`, `a8776d6`, `3bcf223`, `a7c4262`). Manual CI smoke / deliberate fail / fork guard closed in `a7c4262` — treated as evidenced by progress stamps, not re-executed in this review.
