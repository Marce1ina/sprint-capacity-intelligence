# EM Account Deletion and Data Purge Implementation Plan

## Overview

Deliver S-05 (`delete-user-account`): an EM can permanently delete their account and all associated stored data (integration tokens, Supabase auth profile). Builds on completed S-01 auth/onboarding and F-01 `IntegrationTokenService`. Introduces the project's first service-role Supabase client for `auth.admin.deleteUser()`.

## Current State Analysis

- **Auth:** Google OAuth via Supabase SSR cookie client (`src/lib/supabase.ts`); middleware resolves `context.locals.user` and gates `/dashboard` + `/onboarding`.
- **Sign-out:** `POST /api/auth/signout` calls `supabase.auth.signOut()` only — no DB or auth user removal (`src/pages/api/auth/signout.ts`).
- **Token store (F-01):** `integration_tokens` with `user_id → auth.users ON DELETE CASCADE`, owner-only RLS, `IntegrationTokenService.deleteToken()` implemented but unused in routes (`src/lib/services/integration-token-service.ts:119-129`).
- **No settings/account UI:** Closest pattern is `dashboard.astro` glass card + native POST forms.
- **No service role:** `astro.config.mjs` env schema has `SUPABASE_URL`, `SUPABASE_KEY`, `TOKEN_ENCRYPTION_KEY` only; README defers service role to S-04.
- **No profiles table:** Roadmap "profile" = Supabase `auth.users` record (email, metadata from Google OAuth).
- **Google Calendar tokens:** Not stored yet (S-03); revoke helper must no-op gracefully until then.

### Key Discoveries:

- Deleting `auth.users` via Admin API auto-cascades `integration_tokens` — explicit purge still chosen for ordered Google revoke and clear orchestration.
- `/settings` must be auth-gated but **not** Jira-gated so users on `/onboarding` can delete without completing Jira setup.
- shadcn `Button` already has `destructive` variant (`src/components/ui/button.tsx:13-14`) — unused; fits delete CTA.
- Lessons learned: hosted-env checklist required when new secrets touch production (`context/foundation/lessons.md`).

## Desired End State

After this plan completes:

- Authenticated EM visits `/settings`, sees account email, and can permanently delete via two-step confirmation.
- Successful deletion: Google Calendar refresh token revoked (when stored) → all `integration_tokens` removed → `auth.users` deleted → session cleared → redirect `/`.
- Failed deletion: redirect `/settings?error=...` with safe user message; no secrets in response or logs.
- `npm run lint` and `npm run build` pass.
- README/AGENTS document new route, env var, and production secret setup.

### Verification:

1. Local: sign in → `/settings` → two-step delete → signed out on `/`; user cannot sign in again with same Google account (new auth user created on re-sign-in).
2. DB: no `integration_tokens` rows for deleted `user_id`; no `auth.users` row for that id.
3. Unauthenticated `POST /api/account/delete` redirects to sign-in.
4. Delete works from onboarding state (user without Jira token).

## What We're NOT Doing

- Data export before delete
- Soft-delete or recovery grace period
- Email confirmation or re-auth password challenge
- Revoking Google sign-in OAuth via Supabase `provider_token` (deferred until calendar/sign-in token storage is unified)
- Automated test framework (lint + build + manual verification)
- Purging future S-02–S-04 tables (not in schema yet; document FK requirement for future slices)
- Supabase Dashboard clicks (user-owned; documented in Phase 3)

## Implementation Approach

Three incremental phases:

1. **Deletion backend** — service-role admin client, `deleteAllTokens`, Google revoke helper, account error messages. Testable in isolation via manual script or API smoke before UI.
2. **Settings UI & API** — `/settings` page with two-step React delete form, `POST /api/account/delete`, middleware and nav updates.
3. **Docs & production readiness** — env/docs updates and hosted `SUPABASE_SERVICE_ROLE_KEY` checklist.

## Critical Implementation Details

**CSRF (accepted MVP risk):** Client-side two-step confirmation only — `POST /api/account/delete` has no server-issued nonce. SameSite=Lax session cookies mitigate cross-origin POST in practice; explicit CSRF guard deferred (impl-review F1, 2026-06-14).

**Settings route vs Jira gate:** Add `/settings` to protected routes for auth, but exclude it from the `hasToken('jira')` redirect block in `src/middleware.ts`. Otherwise users stuck on onboarding cannot reach account deletion.

**Admin client fail-fast:** Call `createAdminClient()` immediately after the auth check, before revoke or token purge. If it returns `null`, redirect `/settings?error=...` with `config_error` and stop — do not purge tokens when the service role is missing.

**Partial-failure edge case:** If token purge succeeds but `admin.deleteUser` fails, the user has no app data but an orphan `auth.users` row. Surface a generic error; do not retry token purge. Acceptable rare edge case for MVP.

**Google revoke timing:** Read `google_calendar` refresh token via `getGoogleCalendarTokens()` _before_ `deleteAllTokens()`. Revoke failure is logged but non-blocking (user chose skip-if-missing semantics extended to best-effort revoke).

## Phase 1: Deletion Backend

### Overview

Introduce server-only admin Supabase client and orchestration helpers for token purge, optional Google revoke, and auth user deletion.

### Changes Required:

#### 1. Service role env schema

**File**: `astro.config.mjs`

**Intent**: Declare `SUPABASE_SERVICE_ROLE_KEY` as a server-only secret so the admin client can be created in API routes.

**Contract**: Add `SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret", optional: true })` to `env.schema`.

#### 2. Env example

**File**: `.env.example`

**Intent**: Document the new secret for local Node and Cloudflare dev setup.

**Contract**: Add commented `SUPABASE_SERVICE_ROLE_KEY=` with pointer to Supabase Dashboard → Settings → API → service_role key. Note: never expose to client.

#### 3. Admin Supabase client factory

**File**: `src/lib/supabase-admin.ts` (new)

**Intent**: Create a service-role client for Admin Auth API calls; separate from session cookie client to prevent accidental use in user-facing flows.

**Contract**: Export `createAdminClient(): SupabaseClient | null` using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `astro:env/server`. Return `null` when env missing. Pass `auth: { autoRefreshToken: false, persistSession: false }` per Supabase edge-function pattern.

#### 4. Bulk token deletion

**File**: `src/lib/services/integration-token-service.ts`

**Intent**: Provide a single call site for purging all stored integration credentials before auth user deletion.

**Contract**: Add `deleteAllTokens(userId: string): Promise<void>` that deletes rows for both providers (`jira`, `google_calendar`). Reuse existing `deleteToken` internally or issue one `.delete().eq('user_id', userId)` — either satisfies contract.

#### 5. Google token revocation helper

**File**: `src/lib/services/google-revoke.ts` (new)

**Intent**: Best-effort revoke of stored Google Calendar refresh token before local purge.

**Contract**: Export `revokeGoogleRefreshToken(refreshToken: string): Promise<void>`. `POST https://oauth2.googleapis.com/revoke` with `Content-Type: application/x-www-form-urlencoded` and token in body or query. Treat HTTP 200 as success; log non-2xx without throwing (caller decides whether to proceed — deletion flow proceeds regardless).

#### 6. Account deletion error messages

**File**: `src/lib/account-errors.ts` (new)

**Intent**: Map deletion failure modes to safe user-facing strings for `?error=` redirects.

**Contract**: Export `accountDeletionErrorMessage(code: string): string` with codes such as `not_authenticated`, `config_error`, `delete_failed`. Messages must not include stack traces, tokens, or internal IDs.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build passes: `npm run build`
- Type checking passes as part of build

#### Manual Verification:

- With valid env, admin client factory returns non-null client in a dev API route or temporary log check
- `deleteAllTokens` removes both provider rows for a test user (local Supabase)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Settings UI & Delete API

### Overview

Expose account deletion through a dedicated settings page and authenticated delete API route following existing native-POST + redirect patterns.

### Changes Required:

#### 1. Delete account API route

**File**: `src/pages/api/account/delete.ts` (new)

**Intent**: Orchestrate irreversible account deletion for the authenticated EM.

**Contract**: `export const prerender = false`; `POST` handler. Require `context.locals.user`; unauthenticated → redirect `/auth/signin?error=${encodeURIComponent(accountDeletionErrorMessage('not_authenticated'))}`. Flow:

1. `createAdminClient()`; if `null` → redirect `/settings?error=${encodeURIComponent(accountDeletionErrorMessage('config_error'))}` (before any destructive steps)
2. Session client + `IntegrationTokenService` with `TOKEN_ENCRYPTION_KEY`
3. If `getGoogleCalendarTokens(user.id)` returns refresh token → `revokeGoogleRefreshToken(refreshToken)` (best effort)
4. `deleteAllTokens(user.id)`
5. `auth.admin.deleteUser(user.id)` on the admin client from step 1; fail → redirect `/settings?error=${encodeURIComponent(accountDeletionErrorMessage('delete_failed'))}`
6. `supabase.auth.signOut()` on session client
7. Redirect `/`

Never log tokens, PATs, or service role key. Catch errors → safe redirect.

#### 2. Two-step delete form component

**File**: `src/components/account/DeleteAccountForm.tsx` (new)

**Intent**: Two-step confirmation without email typing — first click arms, second click submits.

**Contract**: React island using `useState` for `armed` boolean. Accept `serverError?: string | null` prop; render `<ServerError message={serverError} />` at the top when present (mirror `SignInForm.tsx`). Step 1: destructive `Button` "Delete account". Step 2: warning copy + "Yes, delete permanently" submit + "Cancel" (resets armed). Native `<form method="POST" action="/api/account/delete">`. Use `cn()` for conditional classes; `SubmitButton` or `Button variant="destructive"` for submit.

#### 3. Settings page

**File**: `src/pages/settings.astro` (new)

**Intent**: Dedicated account page showing email, sign-out, and danger-zone delete section.

**Contract**: Protected page using `Layout` + cosmic glass card pattern (match `dashboard.astro`). Display `user.email`. Include sign-out form (`POST /api/auth/signout`). Render `<DeleteAccountForm client:load serverError={error} />` where `error = Astro.url.searchParams.get('error')` — pass decoded string straight through; no second mapping step (API already encodes human-readable messages via `accountDeletionErrorMessage`, matching `callback.ts`).

#### 4. Middleware updates

**File**: `src/middleware.ts`

**Intent**: Protect `/settings` with auth; keep it outside Jira onboarding gate.

**Contract**: Add `/settings` to `PROTECTED_ROUTES`. Wrap existing `hasToken('jira')` logic so it does **not** run when `pathname.startsWith('/settings')`.

#### 5. Shared authenticated navigation

**File**: `src/components/AppNav.astro` (new)

**Intent**: Consistent nav on all authenticated app pages so onboarding-blocked users can discover `/settings` without typing the URL.

**Contract**: Extract the authenticated branch from `Topbar.astro` into a reusable component. Show user email + links: Dashboard (`/dashboard`), Settings (`/settings`), Sign out (native POST to `/api/auth/signout`). Match existing Topbar styling (`border-white/10`, purple link hover).

#### 6. Mount shared nav on authenticated pages

**Files**: `src/pages/dashboard.astro`, `src/pages/onboarding.astro`, `src/pages/settings.astro`

**Intent**: Every authenticated surface exposes the same path to account settings.

**Contract**: Import `<AppNav />` and render it above the page content (full-width, outside the glass card). Remove inline sign-out button from `dashboard.astro` — nav handles it.

#### 7. Topbar uses shared nav

**File**: `src/components/Topbar.astro`

**Intent**: Avoid duplicating nav markup on the landing page.

**Contract**: When `user` is present, render `<AppNav />` instead of inline Dashboard/Sign out links.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Authenticated user with Jira token: `/settings` loads, shows email, two-step delete works end-to-end
- User on `/onboarding` (no Jira token): `/settings` accessible via AppNav; delete works
- Unauthenticated `/settings` redirects to sign-in
- Failed delete (e.g. unset service role) shows error banner on settings without leaking internals; integration tokens remain intact
- After delete, signing in again creates a fresh user (new `auth.users` id)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Docs & Production Readiness

### Overview

Document new routes and secrets; add explicit production checklist so hosted deletion works (per lessons learned from F-01/S-01).

### Changes Required:

#### 1. AGENTS.md auth section

**File**: `AGENTS.md`

**Intent**: Onboard future agents to account deletion flow and service-role usage boundary.

**Contract**: Add settings page, delete API route, `SUPABASE_SERVICE_ROLE_KEY` env var, and rule: service-role client only in delete orchestration — never attach to `context.locals` or client UI.

#### 2. README updates

**File**: `README.md`

**Intent**: Document routes, env var, and production setup for account deletion.

**Contract**: Extend auth routes table with `/settings` and `POST /api/account/delete`. Add `SUPABASE_SERVICE_ROLE_KEY` to env vars section (server-only; from Supabase Dashboard). Add **Production readiness** subsection for S-05: set Wrangler secret, smoke-test delete on prod URL (or staging), verify `auth.users` + `integration_tokens` cleanup in Supabase Table Editor.

#### 3. Hosted environment checklist (in README or plan artifact)

**File**: `README.md` (Production readiness subsection)

**Intent**: Prevent repeat of F-01/S-01 hosted-env gaps.

**Contract**: Checklist items:

- [ ] `SUPABASE_SERVICE_ROLE_KEY` in Cloudflare Wrangler secrets (and `.dev.vars` locally)
- [ ] End-to-end delete smoke on deployed Worker URL
- [ ] Confirm no orphaned `integration_tokens` for deleted test user in hosted Supabase

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- README/AGENTS accurately describe settings and delete flow
- Production (or staging) delete smoke completes with service role secret set
- Re-sign-in after delete works (new user, onboarding shown)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None in project today; defer automated unit tests.

### Integration Tests:

- Manual local flow via `npm run dev` + local Supabase (`npx supabase start`).

### Manual Testing Steps:

1. Sign in with Google, complete Jira onboarding, visit `/settings`, execute two-step delete, confirm redirect to `/` and signed-out state.
2. In Supabase Studio: verify `auth.users` and `integration_tokens` have no row for deleted user id.
3. Sign in again with same Google account — confirm new user id and onboarding shown.
4. Sign in, skip/do not complete Jira (or use fresh user before PAT save), visit `/settings`, delete — confirm works without Jira token.
5. Unset `SUPABASE_SERVICE_ROLE_KEY`, attempt delete — confirm `/settings?error=...` with safe message.
6. (Post-S-03) With `google_calendar` token stored, delete and verify revoke attempted (network tab or logs).

## Performance Considerations

Deletion is a rare, user-initiated action. Sequential steps (revoke → token delete → admin delete → signOut) are acceptable; no batching or async job queue needed for MVP EM traffic.

## Migration Notes

No new migration. Existing `integration_tokens.user_id` FK with `ON DELETE CASCADE` remains the safety net. When S-02–S-04 add user-scoped tables, each migration must either reference `auth.users(id) ON DELETE CASCADE` or be explicitly purged in `POST /api/account/delete`.

## References

- Roadmap S-05: `context/foundation/roadmap.md`
- PRD guardrails: `context/foundation/prd.md` (Access Control, data minimization)
- Token service: `src/lib/services/integration-token-service.ts`
- Sign-out pattern: `src/pages/api/auth/signout.ts`
- Lessons: `context/foundation/lessons.md`
- Supabase Admin API: `auth.admin.deleteUser(id)` (service role)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Deletion Backend

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 719ed94
- [x] 1.2 Production build passes: `npm run build` — 719ed94
- [x] 1.3 Type checking passes as part of build — 719ed94

#### Manual

- [x] 1.4 With valid env, admin client factory returns non-null client in a dev API route or temporary log check — 719ed94
- [x] 1.5 `deleteAllTokens` removes both provider rows for a test user (local Supabase) — 719ed94

### Phase 2: Settings UI & Delete API

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — 719ed94
- [x] 2.2 Production build passes: `npm run build` — 719ed94

#### Manual

- [x] 2.3 Authenticated user with Jira token: `/settings` loads, shows email, two-step delete works end-to-end — 719ed94
- [x] 2.4 User on `/onboarding` (no Jira token): `/settings` accessible; delete works — 719ed94
- [x] 2.5 Unauthenticated `/settings` redirects to sign-in — 719ed94
- [x] 2.6 Failed delete (e.g. unset service role) shows error banner on settings without leaking internals; integration tokens remain intact
- [x] 2.7 After delete, signing in again creates a fresh user (new `auth.users` id) — 719ed94

### Phase 3: Docs & Production Readiness

#### Automated

- [x] 3.1 Linting passes: `npm run lint` — 719ed94
- [x] 3.2 Production build passes: `npm run build` — 719ed94

#### Manual

- [x] 3.3 README/AGENTS accurately describe settings and delete flow — 719ed94
- [x] 3.4 Production (or staging) delete smoke completes with service role secret set
- [x] 3.5 Re-sign-in after delete works (new user, onboarding shown)
