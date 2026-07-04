# Phase 1: Test Runner Bootstrap + Security-Critical Paths

## Overview

Bootstrap Vitest for this Astro 6 SSR project and add the cheapest high-signal tests that prove Risks #2 (token leakage), #3 (auth gates), and #5 (cross-user token IDOR) stay protected. No Playwright, no MSW in this phase — direct handler imports and local Supabase for RLS.

## Current State Analysis

- **Zero application tests** — `package.json` has no `test` script; no Vitest dependency.
- **Token leakage**: centralized `{ error: string }` via `jsonError`; PAT/OAuth never serialized today (`research.md` Risk #2).
- **Auth**: middleware gates 3 pages + Jira onboarding redirects; API routes auth in handlers; OAuth callback not middleware-gated (`research.md` Risk #3).
- **IDOR**: RLS on `integration_tokens` is the real isolation boundary; manual proof in `scripts/verify-integration-tokens.mts` (cross-read only) (`research.md` Risk #5).
- **Stack**: Vitest via Astro `getViteConfig()` per `/withastro/docs` testing guide (checked 2026-07-04).

### Key Discoveries

- `src/lib/jira-api-context.ts` is the highest-leverage test target for Risk #2 — not `src/lib/services/` alone.
- "Valid session → dashboard" requires Jira token; OAuth callback → `/onboarding` only.
- Sprint-analysis IDOR is **out of scope** — no DB tables exist yet.

## Desired End State

After this plan completes:

1. `npm run test` runs Vitest locally and passes.
2. Unit tests lock the JSON error contract and error translators against secret leakage.
3. Integration tests assert middleware/API redirect and status contracts for auth gates.
4. Integration tests (local Supabase) prove User B cannot read, upsert, or delete User A's `integration_tokens`.
5. `context/foundation/test-plan.md` §6.1 and §6.2 contain cookbook patterns for unit and integration tests.

### Verification

```bash
npm run test
npm run lint
npm run build
```

Optional manual: `npx supabase start` + two-user RLS suite when env vars present.

## What We're NOT Doing

- Playwright / browser e2e
- MSW Jira mocking (Phase 2)
- Sprint-analysis or calendar OAuth route tests (no routes/tables yet)
- CI test gate wiring (Phase 4)
- Client redirect-on-401 UX change for stale sessions
- Testing Risk #1, #4, #6, #7

## Implementation Approach

Order by cost × signal per test-plan §1:

1. **Bootstrap** — Vitest + path aliases + `test` script (unblocks everything).
2. **Risk #2 unit** — pure functions, no HTTP; recursive secret-scan helper reused by integration.
3. **Risk #3 integration** — import middleware + API handlers with mock `APIContext`; assert status/Location/body.
4. **Risk #5 integration** — promote verify-script two-user pattern; add cross-write/delete.
5. **Cookbook** — document patterns in §6.

## Critical Implementation Details

**Middleware integration tests** must construct a mock `context` with `url`, `request.headers`, `cookies`, `locals`, and `redirect` spy — Astro middleware is a plain async function, not a full server.

**RLS tests** require local Supabase (`npx supabase start`). Gate behind `describe.skipIf(!process.env.SUPABASE_URL)` or separate `test:rls` script so default `npm run test` passes without Docker when RLS suite is skipped.

**Secret scan helper** must recursively walk JSON objects and check serialized strings for probe substrings — not top-level key denylist.

## Phase 1: Vitest Bootstrap

### 1.1 Add Vitest and config

- Install `vitest` as devDependency.
- Create `vitest.config.ts` using `getViteConfig()` from `astro/config` with `test.environment: 'node'`.
- Add `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json`.
- Add `src/test/` for shared helpers (secret scanner, mock context factory).
- Spike: import `jsonError` from `@/lib/jira-api-context` in a smoke test to confirm alias resolution.

**Success criteria**: `npm run test` exits 0 with at least one passing smoke test.

## Phase 2: Risk #2 — Token Leakage Guards

### 2.1 Unit — JSON error contract

Test `jsonError`, `mapJiraClientError`, and `resolveJiraApiContext` error branches:

- `jsonError(401, "msg")` body parses to exactly `{ error: "msg" }` — no extra keys.
- `mapJiraClientError(new JiraValidationError("safe"), fallback)` → userMessage only.
- `mapJiraClientError(new Error("SECRET_PROBE"), fallback)` → fallback, not probe.
- `resolveJiraApiContext` with no `context.locals.user` → 401.
- `resolveJiraApiContext` with mocked `getJiraPat` throwing → 503 generic message.
- Mock `getJiraPat` returning `{ pat: "PROBE", siteUrl: "https://x.atlassian.net" }` — success path returns `JiraApiContext` object but any simulated Response serialization must not contain PROBE (test via helper that would stringify a mistaken `{ ...resolved }` response — documents anti-pattern).

**Regression caught**: `{ error, details: error }` or `String(error)` in error paths.

**Anti-pattern avoided**: top-level key denylist only.

### 2.2 Unit — error translators

- `authErrorUserMessage` with raw OAuth error objects → whitelisted messages, never raw `error.message` with tokens.
- Jira client: mock `fetch` returning 401 with body containing fake PAT → thrown `JiraValidationError` message is fixed string.

### 2.3 Unit — encryption round-trip

- `encryptTokenPayload` / `decryptTokenPayload` round-trip — plaintext in, ciphertext out, decrypt restores; error messages contain no plaintext.

### 2.4 Integration — route handler smoke with probe PAT

For each Jira JSON route handler (`boards`, `sprints`, `assignees`):

- Mock `createClient`, `IntegrationTokenService.getJiraPat` → probe PAT.
- Mock Jira `fetch` (global) → minimal valid JSON response.
- Call exported `GET` handler with mock `APIContext` (authenticated user).
- Recursively scan response body — no `PROBE` substring.

Error path: mock Jira fetch 401 → scan error response — no PROBE, no upstream body echo.

**Regression caught**: PAT in JSON response on success or error.

**Research source**: `research.md` Risk #2 — `jira-api-context.ts` + `api/jira/*`.

### 2.5 Integration — redirect routes secret scan

- `POST /api/onboarding/jira` with probe PAT in form → assert redirect Location does not contain probe (mock auth user + supabase).
- Optional: force account-delete token-read failure → spy `console.error` — logged string excludes probe refresh token.

**Edge case**: nested JSON that doesn't exist today — scanner still runs full tree.

## Phase 3: Risk #3 — Auth Gate Contracts

### 3.1 Integration — middleware redirect matrix

Import `onRequest` from `src/middleware.ts`. Cases:

| Case                            | Mock state              | Assert                            |
| ------------------------------- | ----------------------- | --------------------------------- |
| No user, `GET /dashboard`       | `locals.user = null`    | `302`, Location `/auth/signin`    |
| No user, `GET /settings`        | `locals.user = null`    | `302`, Location `/auth/signin`    |
| User, no Jira, `GET /dashboard` | mock `hasToken` → false | `302`, Location `/onboarding`     |
| User, Jira, `GET /onboarding`   | mock `hasToken` → true  | `302`, Location `/dashboard`      |
| User, no Jira, `GET /settings`  | mock `hasToken` → false | `next()` — 200 path (no redirect) |

Mock `IntegrationTokenService.hasToken` via vi.mock to avoid DB.

**Regression caught**: unauthenticated dashboard access; missing Jira onboarding gate.

**Anti-pattern avoided**: full browser OAuth e2e.

### 3.2 Integration — OAuth callback contract

- `GET /api/auth/callback` without `code` → `302` sign-in with error param.
- Mock `exchangeCodeForSession` error → sign-in redirect with mapped message (not raw Supabase message).
- Mock success → redirect `/onboarding` (not `/dashboard`).

**Regression caught**: callback silently succeeds without redirect; wrong post-auth landing.

**Research source**: `research.md` Risk #3 — middleware alone insufficient.

### 3.3 Integration — API auth JSON contract

- `GET` boards handler, no `locals.user` → `401`, `{ error: "Authentication required." }`.
- `POST /api/onboarding/jira`, no user → redirect sign-in.

**Edge case**: documents stale-session client UX gap (401 banner) — no redirect test required in Phase 1.

## Phase 4: Risk #5 — Cross-User Token Isolation

### 4.1 Integration — two-user RLS suite

Promote pattern from `scripts/verify-integration-tokens.mts`:

- User A upserts Jira token via `IntegrationTokenService` with session client A.
- User B `getJiraPat(userAId)` → `null`.
- User B `upsertJiraPat(userAId, payload)` → RLS error or no row change.
- User B `deleteAllTokens(userAId)` → no effect on A's row; A can still read.

Skip when `SUPABASE_URL` / test credentials unavailable.

**Regression caught**: cross-user token read/write/delete.

**Anti-pattern avoided**: mocking `IntegrationTokenService` so RLS never runs.

### 4.2 Unit — route ownership binding

- Assert `resolveJiraApiContext` calls `getJiraPat` with `user.id` from `locals.user` (vi.spy on service prototype).

**Regression caught**: future route passing client-supplied userId.

### 4.3 Static — service role boundary

- Simple test or lint script: `createAdminClient` imported only from `account/delete.ts`; `IntegrationTokenService` never constructed with admin client in `src/`.

**Deferred**: Jira PAT binding via MSW Authorization header → Phase 2.

## Phase 5: Cookbook + Docs

### 5.1 Update test-plan §6

Fill §6.1 (unit) and §6.2 (integration) with:

- Secret recursive scan helper usage.
- Mock `APIContext` factory pattern.
- Middleware handler import pattern.
- RLS two-user fixture prerequisites.
- When to skip RLS tests locally vs CI.

### 5.2 Update AGENTS.md Commands

Add `npm run test` to Commands section.

## References

- `context/foundation/test-plan.md` — Phase 1 scope, Risk Response Guidance
- `context/changes/testing-security-critical-paths/research.md` — grounded failure paths
- `scripts/verify-integration-tokens.mts` — RLS fixture template
- [Astro testing guide](https://docs.astro.build/en/guides/testing/) — `getViteConfig()` (Context7, 2026-07-04)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Vitest Bootstrap

#### Automated

- [x] 1.1 Add Vitest, config, test script, and smoke test

### Phase 2: Risk #2 — Token Leakage Guards

#### Automated

- [x] 2.1 Unit tests for JSON error contract and resolveJiraApiContext error branches
- [x] 2.2 Unit tests for auth-errors and jira-client error sanitization
- [x] 2.3 Unit tests for encryption round-trip
- [x] 2.4 Integration route handler smoke with probe PAT and recursive scan
- [x] 2.5 Integration redirect route secret scan and optional log spy

### Phase 3: Risk #3 — Auth Gate Contracts

#### Automated

- [x] 3.1 Integration middleware redirect matrix — 2116936
- [x] 3.2 Integration OAuth callback contract — 2116936
- [x] 3.3 Integration API auth JSON contract — 2116936

### Phase 4: Risk #5 — Cross-User Token Isolation

#### Automated

- [x] 4.1 Integration two-user RLS suite (read, upsert, delete) — 228b172
- [x] 4.2 Unit test resolveJiraApiContext calls getJiraPat with session user.id — 228b172
- [x] 4.3 Static service-role boundary check — 228b172

#### Manual

- [ ] 4.4 Run RLS suite against local Supabase with two test users

### Phase 5: Cookbook + Docs

#### Automated

- [x] 5.1 Fill test-plan §6.1 and §6.2 cookbook patterns
- [x] 5.2 Add npm run test to AGENTS.md Commands