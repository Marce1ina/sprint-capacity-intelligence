<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Phase 1 — Test Runner Bootstrap + Security-Critical Paths

- **Plan**: context/changes/testing-security-critical-paths/plan.md
- **Scope**: Phase 1 of 5 (Vitest Bootstrap — §1.1 only)
- **Date**: 2026-07-04
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Shared test helpers not created

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/test/ (N/A — files missing)
- **Detail**: Plan §1.1 requires `src/test/` with shared helpers (secret scanner, mock context factory). Only `smoke.test.ts` exists. Phase 2 integration tests depend on these helpers per plan Critical Implementation Details.
- **Fix**: Add `src/test/secret-scan.ts` (recursive JSON probe scanner) and `src/test/mock-api-context.ts` (mock APIContext factory) before starting Phase 2.
- **Decision**: FIXED — added src/test/secret-scan.ts and src/test/mock-api-context.ts

### F2 — test-plan.md updated in bootstrap commit

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: context/foundation/test-plan.md
- **Detail**: Commit `6abbc62` bundles Risk #3/#5 wording refinements and phase-1 status change (`change opened` → `planned`) into the Vitest bootstrap commit. Plan assigns test-plan §6 cookbook updates to Phase 5 (§5.1). Changes align with research.md but blur phase boundaries.
- **Fix A ⭐ Recommended**: Keep the research-informed risk table edits; note them as a documented addendum in plan Progress (Phase 5 prep) so future reviews don't flag as drift.
  - Strength: Preserves accurate risk grounding from research; updates source of truth.
  - Tradeoff: Plan phase boundaries become slightly fuzzy.
  - Confidence: HIGH — edits are substantively correct per research.md.
  - Blind spot: Stakeholders who reviewed original test-plan wording aren't notified.
- **Fix B**: Revert test-plan.md changes from bootstrap commit; re-apply in Phase 5.
  - Strength: Strict scope discipline.
  - Tradeoff: Loses research-grounded risk wording until Phase 5.
  - Confidence: MEDIUM — depends whether downstream phases rely on updated wording now.
  - Blind spot: Haven't checked if other docs reference the old Risk #3 phrasing.
- **Decision**: SKIPPED

### F3 — Duplicated env.schema in vitest.config.ts

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: vitest.config.ts:18-24
- **Detail**: `env.schema` is duplicated inline from `astro.config.mjs`. With `configFile: false`, Vitest won't pick up future schema changes made only in astro.config.mjs, causing silent behavioral drift in tests importing `astro:env/server`.
- **Fix**: Extract shared schema to e.g. `src/lib/env-schema.ts` imported by both configs, or add a checklist comment when adding env vars.
- **Decision**: FIXED — extracted src/lib/env-schema.ts; imported from astro.config.mjs and vitest.config.ts

### F4 — No test env isolation guardrails yet

- **Severity**: 👁 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: vitest.config.ts:9-12
- **Detail**: Vitest auto-loads `.env` from project root. Smoke test imports `@/lib/jira-api-context` which pulls `astro:env/server`. Real secrets available in test process on dev machines. Acceptable for Phase 1 smoke; plan defers RLS gating to Phase 4. Address before Phase 2/3 security integration tests.
- **Fix**: Before Phase 2, add `test.setupFiles` with explicit test env stubs or gate real-env suites behind `describe.skipIf` / `test:rls` as plan describes.
- **Decision**: SKIPPED

## Automated Verification

| Command        | Result | Output                        |
| -------------- | ------ | ----------------------------- |
| `npm run test` | PASS   | 1 file, 1 test passed (138ms) |

## Plan vs Git Summary

| In plan AND in diff | vitest.config.ts, package.json, src/test/smoke.test.ts |
| In diff but NOT in plan §1.1 | context/foundation/test-plan.md (risk table refinements) |
| In plan but NOT in diff | src/test/secret-scan helper, src/test/mock-api-context helper |
