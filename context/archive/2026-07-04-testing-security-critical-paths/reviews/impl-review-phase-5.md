<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Phase 5 — Cookbook + Docs

- **Plan**: context/changes/testing-security-critical-paths/plan.md
- **Scope**: Phase 5 of 5
- **Date**: 2026-07-04
- **Verdict**: NEEDS ATTENTION → APPROVED (after fixes)
- **Findings**: 0 critical 7 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — RLS table misstates test:rls fail-fast behavior

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/foundation/test-plan.md §6.2 table
- **Detail**: Table claimed `npm run test:rls` fails fast on missing env; both scripts use `describe.skipIf(!isRlsSuiteEnabled())` and skip.
- **Fix**: Change table cell to "skipped (`skipIf`)" for both columns when env incomplete.
- **Decision**: FIXED

### F2 — Middleware doc referenced getUser instead of createClient mock

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/foundation/test-plan.md §6.2
- **Detail**: Middleware tests mock `createClient` returning `{ auth: { getUser } }`, not a bare getUser import.
- **Fix**: Document createClient → auth.getUser pattern from middleware.auth-gates.test.ts.
- **Decision**: FIXED

### F3 — Middleware snippet omitted required Supabase mocks

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/foundation/test-plan.md §6.2
- **Detail**: Abbreviated snippet set locals.user only; middleware overwrites user from Supabase.
- **Fix**: Expand snippet with vi.mock blocks and mockGetUser setup.
- **Decision**: FIXED

### F4 — RLS local run should prefer test:rls serial script

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/foundation/test-plan.md §6.2 table
- **Detail**: Full parallel suite can run RLS against same DB; test:rls uses single worker.
- **Fix**: Mark test:rls as preferred entry point for local RLS runs.
- **Decision**: FIXED

### F5 — API route cookbook omitted required setup steps

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/foundation/test-plan.md §6.2
- **Detail**: Snippet omitted jira-route-mocks, SECRET_PROBE import, afterEach unstubAllGlobals.
- **Fix**: Expand snippet to match jira-routes-secret-scan.test.ts structure.
- **Decision**: FIXED

### F6 — RLS prerequisites incomplete env checklist

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/foundation/test-plan.md §6.2
- **Detail**: Only TOKEN_ENCRYPTION_KEY listed; isRlsSuiteEnabled requires SUPABASE_URL/KEY and all TEST_USER_* vars.
- **Fix**: List full gate matching isRlsSuiteEnabled().
- **Decision**: FIXED

### F7 — §4 Stack Vitest row still TBD after Phase 1 shipped

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/test-plan.md §4
- **Detail**: Vitest ^4.1.9 installed and configured but §4 said "none yet".
- **Fix**: Update version and notes to reflect vitest.config.ts.
- **Decision**: FIXED

### F8 — RLS helpers list omitted requireEncryptionKey

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/foundation/test-plan.md §6.2
- **Detail**: integration-token-service.rls.test.ts calls requireEncryptionKey in beforeAll.
- **Fix**: Add to helper bullets.
- **Decision**: FIXED

### F9 — signInOrSignUp auto-registration not documented

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/foundation/test-plan.md §6.2
- **Detail**: Step said "create users" but helper auto-signs-up on failed sign-in.
- **Fix**: Reword prerequisite step 3.
- **Decision**: FIXED
