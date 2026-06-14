<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Integration Token Store Implementation Plan

- **Plan**: context/changes/integration-token-store/plan.md
- **Mode**: Deep
- **Date**: 2026-06-05
- **Verdict**: SOUND (after triage fixes)
- **Findings**: 1 critical, 2 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 5/5 paths ✓, 4/4 symbols ✓, brief↔plan ✓

## Findings

### F1 — seed.sql marked optional but config.toml requires it

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Seed file placeholder
- **Detail**: Phase 1 automated criterion 1.1 requires `npx supabase db reset`, but `supabase/config.toml` has `[db.seed] enabled = true` with `sql_paths = ["./seed.sql"]`. No `seed.sql` exists today. The plan marked this file "optional" — `db reset` will fail without it.
- **Fix**: Promote `supabase/seed.sql` to a required Phase 1 deliverable (empty or comment-only SQL). Remove "optional" from the heading.
- **Decision**: FIXED — promoted seed.sql to required Phase 1 deliverable

### F2 — Verification script doesn't cover service + Supabase smoke test

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 2 Manual 2.4, Phase 3 script contract & Manual 3.3
- **Detail**: Manual criteria 2.4 and 3.3 require a full service round-trip against local Supabase. The Phase 3 script contract only covered env checks and in-memory crypto round-trip — no sign-in, DB writes, or RLS check.
- **Fix A ⭐ Recommended**: Extend `scripts/verify-integration-tokens.mts` to sign in, exercise `IntegrationTokenService`, and optionally verify cross-user isolation.
  - Strength: Repeatable smoke test for hardest manual criteria in one command.
  - Tradeoff: Adds `tsx` devDependency and test-user setup docs.
  - Confidence: HIGH — matches the plan's RLS testing caveat.
  - Blind spot: Exact sign-in flow for local Supabase test users not yet documented.
- **Fix B**: Narrow manual 2.4/3.3 to crypto-only; defer DB/service smoke to S-01.
  - Strength: Keeps F-01 script minimal.
  - Tradeoff: RLS untested until S-01.
  - Confidence: MED.
  - Blind spot: S-01 may not cover all provider paths.
- **Decision**: FIXED via Fix A — extended script contract and manual 3.3 criteria

### F3 — Service contract omits JSON serialization step

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Integration token service
- **Detail**: Service stores structured payloads in a text column via AES-GCM but contract did not specify serialize/deserialize format.
- **Fix**: Add `JSON.stringify` before encrypt; `JSON.parse` after decrypt in provider-specific methods.
- **Decision**: FIXED

### F4 — userId parameter with session-only client

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — Integration token service
- **Detail**: Methods accept `userId` but session client + RLS rejects mismatches with opaque PostgREST errors.
- **Fix**: Document that callers must pass the authenticated user's ID.
- **Decision**: FIXED

### F5 — nodejs_compat inaccurately linked to Web Crypto

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State Analysis — Key Discoveries
- **Detail**: Web Crypto is native on Workers; `nodejs_compat` enables Node built-ins, not `crypto.subtle`.
- **Fix**: Reword Key Discoveries bullet to separate Web Crypto from `nodejs_compat`.
- **Decision**: SKIPPED
