---
date: 2026-07-19T15:28:24+02:00
researcher: Claude
git_commit: d3e49814067e6d948af8199d9157476e5d6f0ee2
branch: master
repository: 10x-sprint-load
topic: "Assignee calendar invite (S-03): inviting sprint assignees to connect Google Calendar via link"
tags: [research, codebase, auth, oauth, integration-tokens, middleware, jira-sprint-picker, invite]
status: complete
last_updated: 2026-07-19
last_updated_by: Claude
---

# Research: Assignee calendar invite (S-03)

**Date**: 2026-07-19T15:28:24+02:00
**Researcher**: Claude
**Git Commit**: d3e49814067e6d948af8199d9157476e5d6f0ee2
**Branch**: master
**Repository**: 10x-sprint-load

## Research Question

Codebase baseline for roadmap slice S-03 (`assignee-calendar-invite`): EM invites sprint assignees to connect Google Calendar; assignee connects via invite link (FR-004, FR-005). What already exists to build on, what patterns to follow, and what's genuinely greenfield.

## Summary

**Token storage for Google Calendar is already built end-to-end** (schema, types, encryption, service methods) — this was a deliberate F-01 decision to avoid a later migration. **Nothing else exists**: no invite mechanism (table/route/type/component), no OAuth route for calendar scopes, no assignee email/avatar data flowing through the Jira pipeline, and no UI attach point beyond a 2-column assignee table. The EM's Google sign-in OAuth and the assignee's Calendar OAuth are explicitly documented as two separate flows — do not conflate them. No email-sending infra exists (no provider, no lib) — roadmap already defaults to shareable-link-only for MVP, which matches what's buildable today with zero new infra. No Google API client library or generic HTTP client is installed; the established convention is raw `fetch` in a dedicated `src/lib/services/*.ts` file (mirror `jira-client.ts`).

## Detailed Findings

### Token storage (already built, F-01)

- `supabase/migrations/20260605120000_integration_tokens.sql` — `integration_tokens` table: `provider text check (provider in ('jira','google_calendar'))`, `unique(user_id, provider)`, RLS `auth.uid() = user_id`. Adding a provider beyond these two requires altering the SQL check constraint (it's an enum-in-SQL, not a lookup table) — not needed for S-03 since `google_calendar` already exists.
- `src/lib/services/integration-token-service.ts:99-117` — `upsertGoogleCalendarTokens(userId, payload)` / `getGoogleCalendarTokens(userId)` already implemented, generic upsert/select-by-`(user_id, provider)` under the hood (`integration-token-service.ts:20-39,76-93`).
- `src/types.ts:8-13` — `GoogleCalendarTokenPayload { accessToken; refreshToken; expiresAt; scopes: string[] }` already defined.
- `src/lib/crypto/token-encryption.ts` — AES-GCM 256-bit via Web Crypto API (`crypto.subtle`), 12-byte random IV prepended to ciphertext, base64-encoded. `TOKEN_ENCRYPTION_KEY` (32-byte base64) read from `astro:env/server`, same key already used for Jira PAT — no new secret needed.
- `src/test/mock-integration-token-service.ts` — mock currently only stubs `getJiraPat`, `upsertJiraPat`, `getGoogleCalendarTokens`, `deleteAllTokens`, `hasToken`. **Gap**: does not mock `upsertGoogleCalendarTokens` or `deleteToken` — a new OAuth callback route that calls `upsertGoogleCalendarTokens` will need this mock extended before it can be unit-tested against the standard mock module.

### Account deletion already anticipates this feature (S-05)

- `src/pages/api/account/delete.ts:32-45` — reads `getGoogleCalendarTokens(user.id)`, best-effort revokes via `revokeGoogleRefreshToken`, then `deleteAllTokens(user.id)` (provider-agnostic delete, no change needed there).
- `src/lib/services/google-revoke.ts` (20 lines, full contents read) — `POST https://oauth2.googleapis.com/revoke` with `token` form param; never throws, only logs on failure (by design — deletion proceeds regardless).
- `context/archive/2026-06-14-delete-user-account/plan.md:15` — explicitly notes this revoke call is a no-op today ("Google Calendar tokens: Not stored yet (S-03)") and line 307 flags a **Post-S-03 test gap**: "With `google_calendar` token stored, delete and verify revoke attempted." This plan should be revisited once S-03 ships to close that test gap (not S-03's job to write the delete test, but worth flagging in this plan's cross-references).

### Google OAuth: two flows, kept explicitly separate

- `src/pages/api/auth/google.ts:15-20` — EM sign-in: `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } })`, **no `scopes` option** — relies on Supabase's default identity scopes. No app-level Google client id/secret; Supabase's GoTrue owns the OAuth exchange entirely via `supabase/config.toml:325-330` (`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`/`_SECRET` env-substituted, local redirect URI only).
- `src/pages/api/auth/callback.ts` — `exchangeCodeForSession(code)`, PKCE handled transparently by `@supabase/ssr`. Redirects to `/onboarding`.
- `context/archive/2026-06-13-google-auth-jira-onboarding/plan.md:20` — explicit prior decision: **"S-03 Calendar OAuth is a separate flow — do not add Calendar scopes to sign-in OAuth."** This means the calendar-connect OAuth cannot simply add a `scopes` param to the existing `signInWithOAuth` call for the _currently signed-in_ user — and more importantly, an **invited assignee is not necessarily an existing app user at all**, so this flow likely needs its own OAuth client registration/handling rather than routing through Supabase's `signInWithOAuth` (which is tied to creating/authenticating a Supabase Auth user). This is the central open design question for planning: does the assignee need a Supabase account, or is this a lighter-weight "grant calendar read access, store tokens against an invite-linked identity" flow with no Supabase Auth session at all?
- `supabase/config.toml:156-161` — `additional_redirect_urls` is an **exact/wildcard allow-list**; any new callback path needs adding here (local + hosted). Relevant to [[hosted-environment-checklist]] lesson below if a new Google Cloud OAuth client / redirect URI is introduced.
- No Google OAuth client id/secret exists in `src/lib/env-schema.ts` today — only Supabase's own config.toml has them (consumed by GoTrue directly, not Astro). If the calendar flow needs its **own** Google Cloud OAuth client (separate registration, e.g. to request `calendar.readonly` scope independent of Supabase's identity-only client), new env vars would need adding to `env-schema.ts` following the existing `envField.string({ context: "server", access: "secret", optional: true })` pattern.

### Auth middleware / route gating

- `src/middleware.ts:6` — `PROTECTED_ROUTES = ["/dashboard", "/onboarding", "/settings"]`; anything else (e.g. a new `/invite/[token]` page) is public by default, no middleware change needed to expose it to unauthenticated visitors.
- `src/middleware.ts:32-49` — Jira-onboarding gate only fires for paths under `PROTECTED_ROUTES`; an invite-landing route wouldn't be affected by or need to touch this logic.
- `src/lib/service-role-boundary.test.ts:37-70` — **guardrail test**: asserts `createAdminClient` is only imported by `account/delete`, and that `IntegrationTokenService` is never constructed with an admin client. If the invite flow needs to look up/create a Supabase user by email server-side (no existing helper found — no `admin.createUser`/`inviteUserByEmail`/`getUserByEmail` calls anywhere in `src`), using `createAdminClient` from a new invite route will fail this guardrail test until it's updated to allow the new import site. This is a concrete decision point for planning, not just a test tweak — it reopens the "does the assignee need a Supabase Auth account" question above.

### Sprint assignee data (S-02 baseline) — no email/avatar today

- `src/types.ts:51-55` — `SprintAssignee { accountId: string | null; displayName: string; totalStoryPoints: number }` — the only DTO, used unchanged from Jira client → API route → hook → component.
- `src/lib/services/jira-client.ts:17,32-37,217-226,259-284` — `SPRINT_ISSUE_FIELDS` requests Jira's `assignee` field but the `SprintIssueFields` type only declares `accountId`/`displayName`; Jira's raw response likely includes `emailAddress` and `avatarUrls` but they're currently untyped/discarded. Adding assignee email (needed to correlate a Jira assignee to an invite link, and likely to a Google account) requires changes at three layers: the Jira client type + extraction (`jira-client.ts`), the `SprintAssignee` DTO (`types.ts:51-55`), and the render layer.
- `src/components/dashboard/SprintPicker.tsx:128-158` — `AssigneeTable`, 2 columns (Name, Story Points), no action column. Adding an "Invite" button/link per row means inserting a `<TableHead>` (after line 142) and `<TableCell>` (after line 153). The `accountId === null` ("unassigned") row case (line 148) has no Jira identity to correlate an invite to — needs explicit handling (likely: no invite action for unassigned rows).
- `src/pages/api/jira/sprints/[sprintId]/assignees.ts` (29 lines, full) — passes the DTO through untouched; `resolved.email` in this file is the **EM's own** email (used for Jira Basic-auth), not an assignee email — don't confuse the two when reading this route.

### No invite mechanism exists (confirmed greenfield)

- Repo-wide grep for `invite`/`invite_token`/`invites` across `src/` and `supabase/` returns only commented-out stock Supabase Auth email-template config (`supabase/config.toml:235-237`, disabled, unrelated). Zero application code, no migration, no type, no route, no component.
- No `user_preferences` or similar table exists for persisting anything beyond the token store; `context/archive/2026-06-14-jira-sprint-picker/plan.md:289` already flagged that S-03/S-04 may need one if invite state (e.g. token → sprint/assignee mapping, expiry, consumed status) needs to persist beyond the `integration_tokens` row.

### No email-sending infra, no Google API client, no generic HTTP client

- `package.json:19-65` — no `googleapis`, `google-auth-library`, `axios`, `ky`, `got`, `undici`, or any email-provider SDK (Resend/SendGrid/Postmark) installed.
- Established convention: raw `fetch` inline in a dedicated `src/lib/services/*.ts` file, with `AbortSignal.timeout(...)` for cancellation (`jira-client.ts:14,109`; `google-revoke.ts:5`) — no shared HTTP wrapper to reuse or extend; a new Google Calendar API client should follow this same file-per-integration pattern.
- `context/foundation/infrastructure.md:74` — flags that long-running I/O-bound pipelines (Jira/Calendar API waits) may need Cloudflare Queues or chunked/progress responses under platform request-duration limits — relevant to S-04 more than S-03, but worth carrying forward since calendar-token refresh calls will add another external I/O hop.
- Roadmap (`context/foundation/roadmap.md:103`) already defaults S-03 planning to a **shareable link**, not email — this matches reality: no email infra exists, so building an email-invite path would be net-new infra the roadmap already chose to avoid for MVP.

### UI conventions to follow for a new "connect calendar" page

- `src/pages/onboarding.astro` + `src/components/onboarding/JiraPatForm.tsx` — established "connect an integration" pattern: glassmorphism card shell, progressive-enhancement `<form method="POST" action="...">` (not fetch/XHR), server errors round-tripped via `?error=` redirect query param (not client state), shared primitives from `src/components/auth/` (`FormField`, `PasswordToggle`, `SubmitButton`, `ServerError`) reused rather than duplicated, success = plain redirect (no toast/success UI state exists anywhere in the codebase yet).
- `src/components/auth/ServerError.tsx:7-15` — shared error banner component/pattern to reuse for the invite-landing page's error states (invalid/expired token, OAuth denial, etc).
- No "integration connected" status view exists anywhere (checked `settings.astro` — no Jira status shown there either) — there's no precedent to copy for showing connection status; this would be a new UI pattern if the plan wants one.

## Code References

- `supabase/migrations/20260605120000_integration_tokens.sql` — token table schema (already supports `google_calendar`)
- `src/lib/services/integration-token-service.ts:99-117` — Google Calendar token upsert/get methods
- `src/types.ts:1-22,51-55` — `IntegrationProvider`, `GoogleCalendarTokenPayload`, `IntegrationTokenRow`, `SprintAssignee`
- `src/lib/crypto/token-encryption.ts` — AES-GCM encryption helper (reused, no new crypto needed)
- `src/lib/services/google-revoke.ts` — Google token revoke pattern (mirror for any new Google API calls)
- `src/pages/api/account/delete.ts:32-45` — existing consumer of Google Calendar tokens
- `src/pages/api/auth/google.ts`, `src/pages/api/auth/callback.ts` — EM sign-in OAuth (pattern to differentiate from, not reuse directly)
- `supabase/config.toml:150-161,325-330` — auth provider config, redirect allow-list
- `src/middleware.ts:6,32-49` — route gating (`PROTECTED_ROUTES`)
- `src/lib/service-role-boundary.test.ts:37-70` — guardrail restricting `createAdminClient` usage
- `src/lib/services/jira-client.ts:17,32-37,217-284` — assignee data shape + fetch convention to mirror
- `src/components/dashboard/SprintPicker.tsx:128-158` — assignee table, UI attach point
- `src/pages/onboarding.astro`, `src/components/onboarding/JiraPatForm.tsx`, `src/components/auth/ServerError.tsx` — UI conventions to follow
- `src/test/mock-integration-token-service.ts` — test mock gap (`upsertGoogleCalendarTokens`, `deleteToken` unmocked)

## Architecture Insights

- **Provider-keyed generic token store**: one table, one service, `(user_id, provider)` uniqueness — new integrations extend the SQL check constraint + add a typed payload/assert method, not a new table.
- **Fetch-per-service convention**: no shared HTTP client; each external API gets its own `src/lib/services/<name>-client.ts` with inline `fetch` + timeout. Follow this for any Google Calendar API calls (not just the OAuth token exchange).
- **Route gating is allowlist-based** (`PROTECTED_ROUTES` prefix array), so public routes (like an invite-landing page) are opt-out by default — cheap to add, no risk of accidentally protecting it.
- **Service-role access is guardrailed by a test**, not just convention — any invite-flow design that needs `createAdminClient` must account for updating `service-role-boundary.test.ts`.
- **Errors round-trip via redirect query params**, not client-side fetch/JSON error handling, in every existing "connect an integration" flow (Jira onboarding, Google sign-in). A calendar-invite landing page should likely follow the same convention for consistency, though it will need to also handle the "no Supabase session" case that Jira onboarding doesn't.

## Historical Context (from prior changes)

- `context/archive/2026-06-05-integration-token-store/plan.md:5,11,19,33-36` + `plan-brief.md:7,27,43,72` — F-01 deliberately built `google_calendar` token storage ahead of S-03 to avoid a later migration; explicitly lists "Calendar invite/connect flow (S-03)" and "Google Calendar API calls" as out of scope for F-01.
- `context/archive/2026-06-14-delete-user-account/plan.md:15,19,29,46,69,113-117,162,307` — S-05 built forward-compatible Google Calendar revoke logic; line 307 flags a **Post-S-03 test gap** to close once this feature ships.
- `context/archive/2026-06-13-google-auth-jira-onboarding/plan.md:20,42` — explicit decision: Calendar OAuth is a separate flow from sign-in OAuth; do not conflate scopes.
- `context/archive/2026-06-14-jira-sprint-picker/plan.md:30-31,289,303` — no persisted sprint/board selection exists yet; flags that S-03/S-04 may need a `user_preferences`-style table if invite/selection state must persist.
- `context/foundation/lessons.md` — [[implicit-cost-external-services]]: Google Calendar API carries quota/paid-tier implications not yet surfaced — flag explicitly in the plan. [[hosted-environment-checklist]]: if this feature adds a new Google Cloud OAuth client/redirect URI or Supabase auth config change, the plan needs an explicit production-readiness checklist (hosted Supabase config, redirect URL allow-list, any new Wrangler secrets) — S-01 shipped code without this and broke in production.

## Related Research

- No other `research.md` exists yet under `context/changes/**/` (only this one). Historical context above comes from archived `plan.md`/`plan-brief.md` files, which is the closest available prior art.

## Open Questions

1. **Does the invited assignee need a Supabase Auth account, or can this be a lighter-weight token-grant flow with no Supabase session?** This is the single highest-leverage design decision — it determines whether `createAdminClient` (and the `service-role-boundary.test.ts` guardrail) is touched, whether the assignee ever hits `/dashboard`-style protected routes, and how the invite link's identity is correlated back to a Jira `accountId`. Not resolved by any prior plan; must be decided in `/10x-plan`.
2. **Does the calendar-connect OAuth need its own Google Cloud OAuth client (separate from Supabase's identity-only Google provider), to request `calendar.readonly` scope independent of sign-in?** The prior decision ("S-03 is a separate flow") implies yes, but the actual mechanism (raw Google OAuth 2.0 flow hand-rolled vs. Supabase's `signInWithOAuth` with added scopes for an authenticated user) is not decided.
3. **What identifies/expires an invite link** (opaque token in a new table vs. signed/stateless token embedding sprint+assignee id vs. reusing `integration_tokens` row keyed by a pending pseudo-user)? No schema exists yet; `jira-sprint-picker` plan flagged a possible need for a new table.
4. **Does `SprintAssignee` need an email field added** (Jira client + DTO + UI changes across 3 layers) to correlate a Jira assignee to a Google account during invite, or can the EM manually enter/copy an assignee identifier when generating the link? Affects scope size significantly.
