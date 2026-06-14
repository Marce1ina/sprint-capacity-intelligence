<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Google Sign-in and Jira PAT Onboarding

- **Plan**: context/changes/google-auth-jira-onboarding/plan.md
- **Mode**: Deep
- **Date**: 2026-06-14
- **Verdict**: SOUND
- **Findings**: 1 critical, 3 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | PASS    |
| Plan Completeness     | PASS    |

## Grounding

Grounding: 5/5 paths ✓, 3/3 symbols ✓, brief↔plan ✓

## Findings

### F1 — Phase 1 manual test requires `/onboarding` page that Phase 2 creates

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 1 — OAuth callback + Manual Verification (1.4)
- **Detail**: Phase 1 callback contract redirects to `/onboarding` and success criterion 1.4 requires landing there with a session. No `src/pages/onboarding.astro` exists today and the page is created in Phase 2. Phase 1 manual testing will 404 after successful OAuth even though session cookies are set correctly.
- **Fix A ⭐ Recommended**: Phase 1 callback redirects to `/dashboard` temporarily; switch to `/onboarding` when Phase 2 ships the page and middleware guards.
  - Strength: Phase 1 OAuth can be verified end-to-end immediately; `/dashboard` is already auth-protected.
  - Tradeoff: Interim routing differs from final onboarding-first UX until Phase 2.
  - Confidence: HIGH — `/dashboard` exists and middleware already allows authenticated users.
  - Blind spot: None significant.
- **Fix B**: Add a minimal stub `onboarding.astro` in Phase 1 ("Jira setup coming in next phase") so the redirect target exists.
  - Strength: Final redirect URL never changes.
  - Tradeoff: Extra throwaway page or premature scope in Phase 1.
  - Confidence: HIGH — trivial to add.
  - Blind spot: Stub must not conflict with Phase 2 form implementation.
- **Decision**: FIXED via Fix B — Phase 1 adds stub `onboarding.astro`; Phase 2 replaces with full form

### F2 — Onboarding API error contract conflicts with existing redirect-only pattern

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Onboarding API route (`/api/onboarding/jira`)
- **Detail**: Plan says "return 401 redirect or JSON error if absent" and "Display server errors" on the form, but all existing auth APIs (`signin.ts`, `signup.ts`) use `context.redirect(...?error=...)` exclusively — no JSON 401 responses anywhere under `src/pages/api/`. `JiraPatForm` uses native form `POST`, so JSON errors would not surface in `ServerError` without client-side fetch logic.
- **Fix**: Specify redirect-only error handling for all failure paths: unauthenticated → `/auth/signin?error=...`; validation/save failures → `/onboarding?error=...`. Remove "JSON error" from the contract.
  - Strength: Matches proven signin/signup pattern and existing `ServerError` + query-param UX.
  - Tradeoff: None meaningful for a form POST flow.
  - Confidence: HIGH — `signin.ts:15-16` and `signin.astro:5` establish the pattern.
  - Blind spot: None significant.
- **Decision**: FIXED — redirect-only error contract applied to onboarding API, page, and form

### F3 — Phase 3 cleanup misses Topbar and README auth route table

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Legacy Auth Removal & Documentation
- **Detail**: Phase 3 item 4 only lists `Welcome.astro` for CTA cleanup, but `Topbar.astro:27-31` also links to `/auth/signup`. README auth route table (`README.md:173`) still documents email/password signup and confirm-email routes. Manual criterion 3.7 requires accurate README but no explicit Phase 3 task updates the auth route table.
- **Fix**: Add `src/components/Topbar.astro` and README auth route table to Phase 3 changes; grep verification (3.3) should include Topbar signup references.
- **Decision**: FIXED — Topbar, README auth table, and extended grep check added to Phase 3

### F4 — Jira Bearer PAT auth format unverified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Jira credentials validator
- **Detail**: Plan specifies `Authorization: Bearer ${pat}` against `/rest/api/3/myself`, but `research.md` contains no Jira auth format verification and no Jira client exists in code. `plan-brief.md:61` lists this as an open assumption. Atlassian historically used Basic auth (`email:token`); PAT Bearer support must be confirmed during implementation or validation will fail for otherwise valid tokens.
- **Fix A ⭐ Recommended**: Add explicit Phase 2 pre-implementation spike: test Bearer vs Basic against a real Jira Cloud site; document chosen header format in `jira-client.ts` contract.
  - Strength: Catches auth-format mismatch before building UI around it.
  - Tradeoff: ~15 minutes manual verification before coding validator.
  - Confidence: HIGH — plan-brief already flags this as unverified.
  - Blind spot: Self-hosted Jira Server (out of PRD scope) may differ.
- **Fix B**: Implement validator accepting both Bearer and Basic, trying Bearer first.
  - Strength: More tolerant at runtime.
  - Tradeoff: Extra complexity and ambiguous error messages if both fail.
  - Confidence: MEDIUM — may mask misconfigured site URLs.
  - Blind spot: Dual-try adds latency and unclear UX on partial failures.
- **Decision**: FIXED via Fix A — Phase 2 spike step added before validator implementation

### F5 — Middleware `hasToken()` PostgREST errors unhandled

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Middleware onboarding guards
- **Detail**: `IntegrationTokenService.hasToken()` re-throws PostgREST errors (`integration-token-service.ts:139-140`). Middleware has no try/catch around the planned DB lookup. A transient Supabase failure on a protected route would surface as an unhandled 500 instead of a graceful fallback.
- **Fix**: Wrap middleware `hasToken()` call in try/catch; on error log safely (no tokens) and either allow request through with degraded guard or redirect to a generic error page.
  - Strength: Prevents DB blip from bricking all authenticated navigation.
  - Tradeoff: Fail-open vs fail-closed policy must be chosen.
  - Confidence: MED — acceptable to defer for MVP EM traffic but worth noting.
  - Blind spot: Product preference on fail-open (skip onboarding guard) vs fail-closed not documented.
- **Decision**: FIXED — fail-open degraded guard with try/catch documented in middleware contract
