# Assignee Calendar Invite Implementation Plan

## Overview

Let an EM generate a per-assignee shareable link from the sprint assignee table; the assignee opens the link, connects their Google Calendar via OAuth, and the app stores their calendar tokens. This is roadmap slice S-03 (FR-004, FR-005) — the second-to-last prerequisite before S-04's per-person risk table.

## Current State Analysis

The token-storage foundation for this feature already exists (built deliberately ahead of schedule in F-01): `integration_tokens` already supports a `google_calendar` provider row, `IntegrationTokenService.upsertGoogleCalendarTokens`/`getGoogleCalendarTokens` are implemented, AES-GCM encryption is wired, and account deletion already best-effort-revokes a stored Google Calendar refresh token. None of that needs to change.

What's missing is the entire invite mechanism (no table, route, type, or component exists) and the OAuth route that actually populates those token methods — today nothing calls them. The EM's own Google sign-in (`src/pages/api/auth/google.ts`) is a separate, scope-free flow by explicit prior decision (`context/archive/2026-06-13-google-auth-jira-onboarding/plan.md:20`) and must stay that way.

## Desired End State

An EM viewing the sprint assignee table (`SprintPicker.tsx`) can click "Invite" next to any assigned row and get a shareable link copied to their clipboard. Opening that link (as anyone, signed in or not) shows the sprint/assignee context and a "Connect Google Calendar" button. Completing Google's consent screen (calendar read-only, offline access) stores the assignee's encrypted OAuth tokens against their own Supabase account and marks the invite consumed. Revisiting a consumed link shows either a "you're connected" confirmation (if it was this visitor who just connected) or a plain "this link was already used" state (otherwise) — never a silent no-op.

Verification: generate an invite for a real Jira assignee row, open the link in a separate browser profile, complete Google OAuth with a Google account added as a consent-screen test user, confirm a `google_calendar` row appears in `integration_tokens` for that new user, and confirm revisiting the link afterward no longer offers to reconnect.

### Key Discoveries:

- `src/lib/services/integration-token-service.ts:99-117` — Google Calendar token methods already implemented; nothing here changes.
- `src/lib/service-role-boundary.test.ts:36-61` — hard guardrail restricting `createAdminClient` imports to exactly one allowlisted file; any new privileged access needs this list updated in the same change.
- `src/middleware.ts:6` — `PROTECTED_ROUTES` is an allowlist (`/dashboard`, `/onboarding`, `/settings`); a new `/invite/*` tree is public by default, no middleware change needed.
- `supabase/config.toml:156-161` — redirect allow-list is exact-match locally, wildcard-capable (the deployed Worker origin already uses `/**`); local entries need an explicit wildcard added for the new callback path.
- `src/types.ts:51-55` — `SprintAssignee` has no email; Q&A confirmed we're not adding one (EM copies a link, no email delivery).

## What We're NOT Doing

- No email-sending or `mailto:` affordance — the EM copies a shareable link manually (matches roadmap's committed shareable-link default).
- No invite expiry, resend, or regenerate-after-consumption flow — one invite row per (sprint, assignee) ever; consumed is terminal.
- No new Google Cloud OAuth client registration — reuses Supabase's existing Google provider, just requests an additional scope on this one route.
- No RLS test suite or secret-scan hardening beyond the minimum needed to unit-test the new routes (explicit scope choice; the pre-existing `google_calendar` RLS test gap remains open).
- No consumption of the stored calendar tokens (fetching actual events) — that's S-04.
- No bulk/group invites — one invite per assignee row, generated on demand.
- No Google app-verification process — flagged as an open production risk in Phase 4, not solved here.
- No "connection status" indicator surfaced back into `SprintPicker` — the Copy Link action is the only UI surface this slice adds; per-assignee connected/pending status display is S-04's concern.

## Implementation Approach

One new table (`sprint_invites`) tracks invite lifecycle, keyed by an opaque per-invite token, one row per (sprint, assignee) ever. EM-side creation runs under the EM's normal RLS-scoped session (`auth.uid() = invited_by` policy covers it). The assignee-side read/consume path needs cross-user access (the assignee is not `invited_by`), so it's the one path that uses `createAdminClient` — centralized into a single new helper file to keep the guardrail test's allowlist a one-line change. The OAuth flow itself reuses Supabase's existing `signInWithOAuth`, requesting `calendar.readonly` scope only on this route (`access_type=offline`, `prompt=consent` to force a refresh token every time), then reads `provider_token`/`provider_refresh_token` off the resulting session and stores them via the already-built `IntegrationTokenService`.

## Critical Implementation Details

**Google Cloud Console scope + publishing status (blocking for real usage).** Requesting `calendar.readonly` reuses the same Google Cloud OAuth client Supabase's Google sign-in already uses. That client's OAuth consent screen must have `.../auth/calendar.readonly` added to its scope list, and the Calendar API must be enabled on that Google Cloud project. If the consent screen's publishing status is "Testing" (typical for an unverified MVP), **only Google accounts pre-added as test users (max 100) can complete consent** — any other assignee will see a Google-side "access blocked" error, not an app error. This is a real ceiling on who can use the feature until the app either stays within a small test-user list or goes through Google's verification process; Phase 4 makes this an explicit checklist item rather than something the code can work around.

**Token generation must be base64url, not base64.** The invite token goes directly into a URL path segment (`/invite/<token>`). Standard base64 includes `/` and `+`, which corrupt the path; use base64url encoding when converting the `crypto.getRandomValues` output to a string (mirrors the random-byte generation style already used in `token-encryption.ts`, just a different encoding at the output step).

**Missing refresh token must fail loudly, not silently.** If `provider_refresh_token` is absent from the session after `exchangeCodeForSession` (can happen if Google's consent screen didn't force re-consent), do not store an access-token-only payload — it expires in ~1 hour with no way to renew it. Treat this as a callback failure and redirect with an error asking the assignee to retry.

**Consumed-but-just-connected vs. consumed-by-someone-else-earlier.** The landing page must distinguish "you just connected" (redirect includes `?connected=1` right after a successful callback) from "this link was already used" (a bare revisit with no such param) — both hit a `status !== 'pending'` row, but only one should read as success.

## Phase 1: Data model & invite service

### Overview

Add the `sprint_invites` table and the service/helper layer everything else builds on. No routes or UI yet.

### Changes Required:

#### 1. Database migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_sprint_invites.sql`

**Intent**: Track one invite per (sprint, assignee) from creation through consumption, owned by the inviting EM, readable/writable by that EM under normal RLS.

**Contract**:

```sql
create table public.sprint_invites (
  id uuid primary key default gen_random_uuid(),
  sprint_id integer not null,
  jira_account_id text not null,
  jira_display_name text not null,
  invited_by uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'consumed')),
  connected_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  unique (sprint_id, jira_account_id)
);

create index sprint_invites_invited_by_idx on public.sprint_invites (invited_by);

alter table public.sprint_invites enable row level security;

create policy "EMs manage their own invites"
  on public.sprint_invites
  for all
  using (auth.uid() = invited_by)
  with check (auth.uid() = invited_by);
```

No policy exists for the invitee/anon path by design — that path goes exclusively through the admin-client-backed helper in change #3 below, matching the existing precedent of `createAdminClient` for privileged cross-user operations (`src/pages/api/account/delete.ts`).

#### 2. Types

**File**: `src/types.ts`

**Intent**: Typed shape for a `sprint_invites` row, used by the service and routes.

**Contract**: Add `SprintInviteStatus = "pending" | "consumed"` and a `SprintInvite` interface mirroring the migration's columns (camelCase field names, e.g. `sprintId`, `jiraAccountId`, `invitedBy`, `token`, `status`, `connectedUserId`, `createdAt`, `consumedAt`).

#### 3. Invite service

**File**: `src/lib/services/sprint-invite-service.ts`

**Intent**: Encapsulate DB operations for invites, following the same constructor-takes-a-client pattern as `IntegrationTokenService` so callers control which client (RLS-scoped vs admin) it runs under.

**Contract**: Class taking a `SupabaseClient` in its constructor, exposing:

- `createOrGetInvite(invitedBy: string, sprintId: number, jiraAccountId: string, jiraDisplayName: string): Promise<{ token: string }>` — selects an existing row by `(sprint_id, jira_account_id)` first; if none exists, generates a base64url token (see Critical Implementation Details) and inserts. Never creates a second row for the same pair.
- `getInviteByToken(token: string): Promise<SprintInvite | null>`
- `markConsumed(token: string, connectedUserId: string): Promise<boolean>` — conditional update `where token = $1 and status = 'pending'`, returns whether a row was actually updated.

#### 4. Admin-access helper (single new `createAdminClient` import site)

**File**: `src/lib/invite-api-context.ts`

**Intent**: Centralize the one place the invite flow needs cross-user (service-role) access, mirroring the shape of `src/lib/jira-api-context.ts`. Every public invite route imports this helper, never `createAdminClient` directly.

**Contract**: Export `resolveInviteAdminService(): SprintInviteService | null` — constructs `createAdminClient()` and wraps it in a `SprintInviteService`, returning `null` if the admin client isn't configured (callers redirect to a generic config-error state, matching the null-check convention already used for `createClient`/`createAdminClient` elsewhere).

#### 5. Guardrail test update

**File**: `src/lib/service-role-boundary.test.ts`

**Intent**: Allow the one new legitimate `createAdminClient` import site.

**Contract**: Update the expected array at line 60 from `["src/pages/api/account/delete.ts"]` to also include `"src/lib/invite-api-context.ts"`.

#### 6. Test mock extension

**File**: `src/test/mock-integration-token-service.ts`

**Intent**: The Phase 3 callback route will call `upsertGoogleCalendarTokens`; the existing mock class doesn't stub it, so any test exercising that route would hit `undefined`.

**Contract**: Add `mockUpsertGoogleCalendarTokens = vi.fn()` as an exported const and a corresponding `upsertGoogleCalendarTokens = mockUpsertGoogleCalendarTokens` class field, following the existing pattern for the other five mocked methods.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Guardrail test passes with updated allowlist: `npm run test -- src/lib/service-role-boundary.test.ts`

#### Manual Verification:

- Inspect the new table in Supabase Studio (`http://localhost:54323`) — columns, unique constraint, and RLS policy match the migration.

---

## Phase 2: EM-side invite generation

### Overview

Let the EM generate and copy a shareable invite link from the assignee table.

### Changes Required:

#### 1. Invite creation route

**File**: `src/pages/api/jira/sprints/[sprintId]/invites.ts`

**Intent**: Authenticated EM creates (or fetches the existing) invite for one assignee and gets back a shareable URL.

**Contract**: `POST`, `prerender = false`. Requires `context.locals.user` (401 JSON error otherwise, matching `jsonError` convention from `jira-api-context.ts`). Body: `{ jiraAccountId: string; jiraDisplayName: string }`. Uses the normal `createClient` SSR client (not admin — this insert is covered by the EM's own RLS policy). Calls `SprintInviteService.createOrGetInvite(user.id, sprintId, jiraAccountId, jiraDisplayName)`, returns `{ url: "<origin>/invite/<token>" }`.

#### 2. Assignee table UI

**File**: `src/components/dashboard/SprintPicker.tsx`

**Intent**: Add an per-row action to generate and copy the invite link.

**Contract**: New `<TableHead>` after the Story Points column, new `<TableCell>` per row with an "Invite" button — omitted/disabled when `assignee.accountId === null` (the "unassigned" row has no Jira identity to invite). On click: `POST` to the Phase 2.1 route with that row's `accountId`/`displayName`, then `navigator.clipboard.writeText(url)`, then flip the button's label to "Copied" for that row (plain local component state, no new shared component needed).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Unit tests pass for the new route (happy path: authenticated user + valid body → 200 with a `url`): `npm run test -- src/pages/api/jira/sprints/[sprintId]/invites.test.ts`

#### Manual Verification:

- In the dashboard, select a sprint with at least one assigned row, click "Invite," confirm a link is copied to the clipboard and the button shows "Copied."
- Confirm the "unassigned" row (if present) has no Invite action.

---

## Phase 3: Assignee-side connect flow

### Overview

Public landing page + OAuth start/callback routes that let the invited assignee actually connect their calendar.

### Changes Required:

#### 1. Invite landing page

**File**: `src/pages/invite/[token].astro`

**Intent**: Public, unauthenticated-friendly page showing invite context and a way to start OAuth, or an error/success state depending on invite status.

**Contract**: Server-side (frontmatter) calls `resolveInviteAdminService()` → `getInviteByToken(token)`. Three render states: (a) not found or `null` service (config error) → generic invalid-link error, reusing the `ServerError`-style banner pattern from `src/components/auth/ServerError.tsx`; (b) `status === "pending"` → show sprint/assignee context and a link to `/api/invite/<token>/start`; (c) `status === "consumed"` → if `Astro.url.searchParams.get("connected") === "1"`, show a "Calendar connected" success state, otherwise show "this link was already used."

#### 2. OAuth start route

**File**: `src/pages/api/invite/[token]/start.ts`

**Intent**: Kick off Google OAuth with calendar scope, scoped to this one invite.

**Contract**: `GET`, `prerender = false`. Re-verifies the invite is still `pending` via `resolveInviteAdminService()` (redirect to the landing page with an error otherwise). Builds the normal SSR `createClient` and calls `supabase.auth.signInWithOAuth({ provider: "google", options: { scopes: "https://www.googleapis.com/auth/calendar.readonly", queryParams: { access_type: "offline", prompt: "consent" }, redirectTo: "<origin>/api/invite/<token>/callback" } })`, redirecting to `data.url` on success or back to the landing page with `?error=` on failure (reuse `authErrorUserMessage`).

#### 3. OAuth callback route

**File**: `src/pages/api/invite/[token]/callback.ts`

**Intent**: Complete the OAuth exchange, persist the assignee's calendar tokens, mark the invite consumed.

**Contract**: `GET`, `prerender = false`. Reads `?code=`, builds SSR `createClient`, calls `supabase.auth.exchangeCodeForSession(code)`. On failure or missing `provider_refresh_token` on the resulting session, redirect to the landing page with `?error=` (see Critical Implementation Details — missing refresh token is a failure, not a partial success). On success: build `GoogleCalendarTokenPayload` from `session.provider_token`/`provider_refresh_token`/`expires_at`, call `new IntegrationTokenService(supabase, TOKEN_ENCRYPTION_KEY ?? "").upsertGoogleCalendarTokens(user.id, payload)` using the assignee's own freshly-authenticated client, then `resolveInviteAdminService()?.markConsumed(token, user.id)`. Redirect to `/invite/<token>?connected=1`.

#### 4. Redirect allow-list

**File**: `supabase/config.toml`

**Intent**: Let Supabase accept redirects back to the new callback path locally (the deployed Worker origin is already wildcard-covered).

**Contract**: Add `http://127.0.0.1:4321/api/invite/**` and `http://localhost:4321/api/invite/**` to `additional_redirect_urls` (`config.toml:156-161`).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Unit tests pass for start/callback happy paths: `npm run test -- src/pages/api/invite`

#### Manual Verification:

- Open a generated invite link in a private/incognito window, confirm the landing page shows sprint/assignee context.
- Complete Google consent with an account added as a consent-screen test user; confirm redirect to the `?connected=1` success state.
- Revisit the same link afterward; confirm it now shows "already used," not the connect button again.
- Visit a garbage/nonexistent token; confirm the invalid-link error state.

---

## Phase 4: Production readiness & verification

### Overview

Close the loop on hosted config and the Google Cloud Console gotcha flagged in Critical Implementation Details, then verify end-to-end against the deployed app.

### Changes Required:

#### 1. Production readiness checklist (no code change — operational steps)

**Intent**: Per `context/foundation/lessons.md`'s hosted-environment-checklist rule, this feature touches external OAuth config and must not be marked done without verifying hosted state.

**Contract**: Before considering S-03 shippable to production:

- Confirm Google Calendar API is enabled on the Google Cloud project backing `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`.
- Add `.../auth/calendar.readonly` to that project's OAuth consent screen scopes.
- Check the consent screen's publishing status; if "Testing," add every real assignee's Google account as a test user before they attempt to connect (hard ceiling of 100) — document this as a known MVP limitation, not something this plan fixes.
- Confirm the hosted Supabase project's `additional_redirect_urls` already covers `/api/invite/**` via the existing production wildcard (`supabase/config.toml:161`); no new entry needed there, just confirm it's actually applied on the hosted project (Supabase Dashboard → Auth → URL Configuration), since `config.toml` only governs local `supabase start`.
- Apply the Phase 1 migration to the hosted database: `npx supabase db push`.
- No new Wrangler secrets are needed (no new env vars were introduced — the OAuth client id/secret are unchanged, and `TOKEN_ENCRYPTION_KEY` is already set from F-01).

#### 2. Automated test coverage (minimal tier, per Q&A)

**Intent**: Cover the happy paths only — deeper RLS/secret-scan hardening is explicitly out of scope for this slice.

**Contract**: Route tests for `invites.ts`, `start.ts`, `callback.ts` covering: authenticated success, unauthenticated 401 (for `invites.ts`), invalid-token error path, and already-consumed error path (for the landing page / start route).

### Success Criteria:

#### Automated Verification:

- Full test suite passes: `npm run test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- On the deployed Worker URL, repeat the full manual flow from Phase 3 (generate invite → connect → verify consumed state) against hosted Supabase.
- Confirm a `google_calendar` row exists in the hosted `integration_tokens` table for the test assignee after connecting.

---

## Testing Strategy

### Unit Tests:

- `SprintInviteService`: create-then-get returns the same token; a second `createOrGetInvite` call for the same (sprint, assignee) pair returns the existing token, not a new row.
- `markConsumed`: returns `true` on a pending row, `false` on an already-consumed one.

### Integration Tests:

- `POST /api/jira/sprints/[sprintId]/invites` — happy path (200 + url), unauthenticated (401).
- `GET /api/invite/[token]/start` — pending invite redirects to Google; consumed invite redirects to landing page with error.
- `GET /api/invite/[token]/callback` — successful exchange stores tokens and marks consumed; missing refresh token redirects with error.

### Manual Testing Steps:

1. Generate an invite from the dashboard, confirm the link copies.
2. Open the link as a fresh (signed-out) visitor, confirm landing page context.
3. Connect with a consent-screen test-user Google account, confirm success state and stored token.
4. Revisit the link, confirm "already used" state (not the connect button).
5. Visit an invalid token, confirm the error state.

## Performance Considerations

None specific to this slice — invite creation/lookup is a single indexed-row operation; OAuth round-trips are inherently network-bound and already covered by the existing NFR (visible progress for operations exceeding two seconds applies to S-04's risk computation, not this slice's short redirect chain).

## Migration Notes

Net-new table, no existing data to migrate. `sprint_invites` rows are never backfilled from anything.

## References

- Related research: `context/changes/assignee-calendar-invite/research.md`
- Token storage pattern: `src/lib/services/integration-token-service.ts:99-117`
- Admin-client precedent: `src/pages/api/account/delete.ts:19-45`
- Jira context resolution pattern (mirrored for invite-api-context.ts): `src/lib/jira-api-context.ts`
- Guardrail test: `src/lib/service-role-boundary.test.ts:36-61`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data model & invite service

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — 1e45382
- [x] 1.2 Type checking passes: `npm run typecheck` — 1e45382
- [x] 1.3 Linting passes: `npm run lint` — 1e45382
- [x] 1.4 Guardrail test passes with updated allowlist — 1e45382

#### Manual

- [x] 1.5 New table verified in Supabase Studio (columns, unique constraint, RLS) — 1e45382

### Phase 2: EM-side invite generation

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck` — 4635d20
- [x] 2.2 Linting passes: `npm run lint` — 4635d20
- [x] 2.3 Unit tests pass for the invites route — 4635d20

#### Manual

- [x] 2.4 Invite link generated and copied from dashboard UI — 4635d20
- [x] 2.5 Unassigned row has no Invite action — 4635d20

### Phase 3: Assignee-side connect flow

#### Automated

- [x] 3.1 Type checking passes: `npm run typecheck` — 0552103
- [x] 3.2 Linting passes: `npm run lint` — 0552103
- [x] 3.3 Unit tests pass for start/callback routes — 0552103

#### Manual

- [x] 3.4 Landing page shows sprint/assignee context for a pending invite — 0552103
- [x] 3.5 Google consent completes and redirects to connected success state — 0552103
- [x] 3.6 Revisiting a consumed link shows "already used," not the connect button — 0552103
- [x] 3.7 Invalid token shows the invalid-link error state — 0552103

### Phase 4: Production readiness & verification

#### Automated

- [x] 4.1 Full test suite passes: `npm run test`
- [x] 4.2 Type checking passes: `npm run typecheck`
- [x] 4.3 Linting passes: `npm run lint`
- [x] 4.4 Build succeeds: `npm run build`

#### Manual

- [x] 4.5 Google Cloud Console consent-screen checklist completed (Calendar API enabled, scope added, test users added if in Testing mode)
- [ ] 4.6 Hosted Supabase redirect URL configuration confirmed
- [ ] 4.7 Migration applied to hosted database
- [ ] 4.8 Full manual flow repeated against deployed Worker URL
- [ ] 4.9 `google_calendar` row confirmed in hosted `integration_tokens` table
