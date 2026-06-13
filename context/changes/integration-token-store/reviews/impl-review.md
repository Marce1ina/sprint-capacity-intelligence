<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Integration Token Store

- **Plan**: context/changes/integration-token-store/plan.md
- **Scope**: All 3 phases (complete)
- **Date**: 2026-06-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — JSON.parse outside decrypt error handling

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/integration-token-service.ts:57-58
- **Detail**: After successful AES-GCM decrypt, `JSON.parse(plaintext)` runs outside the crypto error path. Corrupt JSON in storage throws `SyntaxError` instead of `TokenEncryptionError`, diverging from the plan contract ("on decrypt failure, throw — do not return partial data").
- **Fix**: Wrap `JSON.parse` in try/catch and rethrow as `TokenEncryptionError` with a generic message (no payload echo).
- **Decision**: FIXED — JSON.parse moved into decryptTokenPayload using existing try/catch

### F2 — No runtime validation of decrypted payloads

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/integration-token-service.ts:58
- **Detail**: Decrypted plaintext is cast with `as T` without validating required fields (`pat`, `accessToken`, `refreshToken`, etc.). Tampered ciphertext that decrypts to valid but incomplete JSON could propagate malformed secrets to downstream callers.
- **Fix**: Add lightweight shape guards per provider (e.g. check `typeof payload.pat === 'string'`) before returning from `getDecryptedPayload`.
  - Strength: Catches corrupt rows at read time; aligns with typed contract in `src/types.ts`.
  - Tradeoff: Small maintenance cost when payload shapes evolve.
  - Confidence: HIGH — fields are fixed and small for MVP.
  - Blind spot: None significant.
- **Decision**: FIXED — provider shape guards added in service

### F3 — README overstates CI secret requirements

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: README.md:199
- **Detail**: README says configure `TOKEN_ENCRYPTION_KEY` as a GitHub repository secret for CI build. `.github/workflows/ci.yml` only sets `SUPABASE_URL` and `SUPABASE_KEY`. Build passes because `TOKEN_ENCRYPTION_KEY` is `optional: true` in `astro.config.mjs` — doc/workflow mismatch may confuse operators.
- **Fix**: Either add `TOKEN_ENCRYPTION_KEY` to the CI workflow env block, or narrow README to state only `SUPABASE_*` are required for CI (encryption key needed at runtime for token operations).
- **Decision**: SKIPPED

### F4 — Raw PostgREST errors bubble to callers

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/integration-token-service.ts:36-37,49-50,84-85,97-98
- **Detail**: Supabase/PostgREST errors are re-thrown unchanged. When S-01 wires API routes, internal policy/constraint details may surface in HTTP responses or logs unless mapped at the route layer.
- **Fix A ⭐ Recommended**: Map Supabase errors to a domain `IntegrationTokenError` at the service boundary; log raw details server-side only.
  - Strength: Centralizes error shaping before multiple API routes consume the service.
  - Tradeoff: Requires error-code mapping table as PostgREST errors evolve.
  - Confidence: MED — no existing service sibling to copy; pattern choice is reasonable either way.
  - Blind spot: Exact PostgREST error shapes under RLS denial not exercised in this review.
- **Fix B**: Leave service as-is; map errors in each API route when S-01 lands.
  - Strength: Keeps F-01 scope minimal; routes own HTTP semantics.
  - Tradeoff: Duplicated mapping if multiple routes call the service.
  - Confidence: HIGH — plan defers API routes to S-01.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix B — error mapping deferred to S-01 API routes

### F5 — IntegrationTokenRow uses camelCase for DB columns

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/types.ts:15-22
- **Detail**: `IntegrationTokenRow` defines `userId`, `encryptedPayload`, `createdAt`, `updatedAt` while Supabase returns snake_case and the service queries snake_case columns directly. Type is currently unused — low risk today.
- **Fix**: Rename fields to snake_case or add a row mapper when the type is first used with Supabase responses.
- **Decision**: FIXED — IntegrationTokenRow fields renamed to snake_case
