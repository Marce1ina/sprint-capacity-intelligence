<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Phase 2 — Risk #2 Token Leakage Guards

- **Plan**: context/changes/testing-security-critical-paths/plan.md
- **Scope**: Phase 2 of 5 (§2.1–2.5)
- **Date**: 2026-07-04
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

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

### F1 — Account-delete log test never injects probe token

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/redirect-routes-secret-scan.test.ts:95-114
- **Detail**: Plan §2.5 optional case: spy `console.error` when Google token read fails and assert logged string excludes probe refresh token. Test defines `probeRefresh` but `mockGetGoogleCalendarTokens` rejects with generic `"decryption failed"` — probe never enters the code path. Test passes even if production logged unsanitized `error.message` containing a token.
- **Fix**: Reject with `new Error(\`decryption failed: ${SECRET_PROBE}\`)`or resolve`{ refreshToken: probeRefresh }` and fail downstream; then assert logged output excludes probe substrings.
  - Strength: Exercises the real failure path in `delete.ts` where `error.message` is logged verbatim.
  - Tradeoff: Minor — one mock line change plus assertion tightening.
  - Confidence: HIGH — production code logs `error.message` directly today.
  - Blind spot: None significant.
- **Decision**: FIXED — mock rejects with probe in error.message; delete.ts logs fixed message without error.message

### F2 — vi.mock calls live in shared helper module

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/test/jira-route-mocks.ts:9-19
- **Detail**: `vi.mock(...)` for `astro:env/server`, `@/lib/supabase`, and `IntegrationTokenService` is in a helper imported by route tests. Vitest hoists mocks from the test file; this works only because `jira-route-mocks` is imported before route handlers. Reordering imports could load real modules and read `.env` secrets or fail unpredictably.
- **Fix A ⭐ Recommended**: Move `vi.mock` calls into `jira-routes-secret-scan.test.ts` (or a Vitest `setupFiles` entry); keep `jira-route-mocks.ts` mock-free with fixtures and setup helpers only.
  - Strength: Matches Vitest hoisting rules; removes import-order fragility.
  - Tradeoff: Slightly more boilerplate in the test file.
  - Confidence: HIGH — standard Vitest pattern used elsewhere in this repo's redirect tests.
  - Blind spot: Haven't verified all import order permutations fail today.
- **Fix B**: Add a dedicated `src/test/setup-jira-routes.ts` referenced from `vitest.config.ts` `setupFiles`.
  - Strength: Centralizes mocks without import-order coupling.
  - Tradeoff: Global setup affects all tests; needs scoping if mocks differ per suite.
  - Confidence: MED — works but adds config surface.
  - Blind spot: Interaction with other test files importing same modules.
- **Decision**: FIXED — moved vi.mock into jira-routes-secret-scan.test.ts; jira-route-mocks.ts is mock-free

### F3 — Duplicated mock boilerplate across Phase 2 test files

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/jira-api-context.test.ts:10-20, src/test/jira-route-mocks.ts:9-19, src/pages/api/redirect-routes-secret-scan.test.ts:19-50
- **Detail**: Same `astro:env/server` and Supabase service mocks repeated in three files. Benign today but increases drift risk when env schema grows (see Phase 1 F3 fix for shared env schema).
- **Fix**: Extract shared mock factory or setup file once F2 relocation is decided; document in Phase 5 cookbook.
- **Decision**: FIXED — extracted mock-server-deps.ts and mock-supabase-client.ts; shared across Phase 2 test files

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/jira-api-context.test.ts, src/lib/auth-errors.test.ts, src/lib/crypto/token-encryption.test.ts
- **Detail**: Extra tests not listed in §2.1–2.3: site URL validation branch, null/undefined auth errors, expired-message mapping, empty encryption key. All align with Risk #2 intent; no unrelated scope creep.
- **Fix**: No action required — optionally note extras in plan Progress as discovered coverage.
- **Decision**: PENDING

## Automated Verification

| Command        | Result | Output                           |
| -------------- | ------ | -------------------------------- |
| `npm run test` | PASS   | 7 files, 24 tests passed (213ms) |

## Plan vs Git Summary

| Category                           | Files                                                                                                                                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In plan AND implemented            | `src/lib/jira-api-context.test.ts`, `src/lib/auth-errors.test.ts`, `src/lib/services/jira-client.test.ts`, `src/lib/crypto/token-encryption.test.ts`, `src/pages/api/jira/jira-routes-secret-scan.test.ts`, `src/pages/api/redirect-routes-secret-scan.test.ts` |
| Supporting (plan-described intent) | `src/test/fixtures.ts`, `src/test/jira-route-mocks.ts`, `src/test/mock-integration-token-service.ts`, `src/test/mock-api-context.ts`                                                                                                                            |
| In plan but NOT in diff            | None for §2.1–2.5                                                                                                                                                                                                                                               |
| Unplanned production changes       | None                                                                                                                                                                                                                                                            |
