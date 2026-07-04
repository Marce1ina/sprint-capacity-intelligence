<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Phase 4 — Cross-User Token Isolation

- **Plan**: context/changes/testing-security-critical-paths/plan.md
- **Scope**: Phase 4 of 5
- **Date**: 2026-07-04
- **Verdict**: APPROVED
- **Findings**: 0 critical 0 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — RLS tests could run against remote Supabase

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/test/rls-fixtures.ts
- **Detail**: RLS suite mutates real integration_tokens via SUPABASE_URL with no local-only guard.
- **Fix**: Gate isRlsSuiteEnabled on localhost/127.0.0.1 hostname.
- **Decision**: FIXED

### F2 — Duplicate test-user emails bypass isolation

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/test/rls-fixtures.ts
- **Detail**: Same email for TEST_USER_EMAIL and TEST_USER_B_EMAIL would make cross-user tests pass vacuously.
- **Fix**: Throw when emailA === emailB in requireRlsTestCredentials().
- **Decision**: FIXED

### F3 — Static boundary regex bypass via aliased admin client

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/service-role-boundary.test.ts
- **Detail**: Literal-pattern scan missed createAdminClient() assigned to a variable then passed to IntegrationTokenService.
- **Fix**: Track adminClient variable names from createAdminClient() assignments and flag constructor usage.
- **Decision**: FIXED

### F4 — Upsert RLS assertion too permissive

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/integration-token-service.rls.test.ts
- **Detail**: rejects.toThrow() would pass on unrelated errors.
- **Fix**: expectRlsDenial helper asserts code 42501 or RLS message substring.
- **Decision**: FIXED

### F5 — Missing cross-user deleteToken coverage

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/integration-token-service.rls.test.ts
- **Detail**: Plan research called for cross-delete beyond deleteAllTokens.
- **Fix**: Added test that User B deleteToken(userAId) leaves A's row intact.
- **Decision**: FIXED

### F6 — No test:rls script

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: package.json
- **Detail**: RLS suite easy to miss without dedicated script.
- **Fix**: Added test:rls with single-worker pool for DB tests.
- **Decision**: FIXED

### F7 — Mock vs prototype spy for ownership test

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/jira-api-context.test.ts
- **Detail**: Plan suggested vi.spy on prototype; codebase uses module mock pattern.
- **Fix**: Added comment linking mock assertion to jira-api-context.ts user.id binding; accepted mock pattern.
- **Decision**: FIXED (accepted pattern)

### F8 — TEST_USER_* not in .env.example

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .env.example
- **Detail**: RLS prerequisites undocumented in env template.
- **Fix**: Added commented TEST_USER_* block.
- **Decision**: FIXED

### F9 — Manual 4.4 still pending

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: plan.md Progress 4.4
- **Detail**: Live two-user Supabase run not recorded in this session.
- **Fix**: Run npm run test:rls with local Supabase and two users when Docker available.
- **Decision**: PENDING (manual step)
