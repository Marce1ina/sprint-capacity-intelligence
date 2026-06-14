# EM Account Deletion and Data Purge — Plan Brief

> Full plan: `context/changes/delete-user-account/plan.md`

## What & Why

S-05 lets an EM permanently delete their account and all associated stored data (integration tokens, Supabase auth profile). Stored Jira PATs and future calendar OAuth tokens create a data-retention obligation — trustworthy offboarding is required even though this slice is off the north-star path.

## Starting Point

Google sign-in and Jira PAT onboarding (S-01) are complete. `integration_tokens` has owner-only RLS with `ON DELETE CASCADE` from `auth.users`. `IntegrationTokenService.deleteToken()` exists but is unused in routes. Sign-out (`POST /api/auth/signout`) clears session cookies only. No settings page, no service-role client, no admin auth APIs.

## Desired End State

An authenticated EM opens `/settings`, sees their account email, and can permanently delete via a two-step confirmation. Deletion revokes Google Calendar OAuth (when a stored refresh token exists), purges all integration tokens, removes the Supabase auth user, ends the session, and redirects to the landing page. Failures redirect to `/settings?error=...` with a safe message; secrets never appear in UI or logs.

## Key Decisions Made

| Decision                 | Choice                                                              | Why (1 sentence)                                                | Source |
| ------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------- | ------ |
| Entry point              | Dedicated `/settings` page                                          | Room for future account settings without cluttering dashboard   | Plan   |
| Confirmation UX          | Two-step button                                                     | Simplest irreversible-action guard without extra input fields   | Plan   |
| Purge order              | Revoke Google (if token) → explicit token delete → admin deleteUser | Matches revoke intent; explicit purge before auth removal       | Plan   |
| Google revoke (pre-S-03) | Skip when no `google_calendar` token stored                         | Deletion works today; calendar revoke activates when S-03 lands | Plan   |
| Error handling           | Redirect with `?error=` query param                                 | Matches existing onboarding/sign-in error pattern               | Plan   |
| Scope                    | Delete only — no export, grace period, or email confirm             | Smallest trustworthy slice under time pressure                  | Plan   |
| Settings access          | Auth-only — no Jira token required                                  | Users stuck on onboarding can still delete their account        | Plan   |

## Scope

**In scope:** Service-role admin client, `deleteAllTokens`, Google revoke helper, `/settings` page, two-step delete UI, `POST /api/account/delete`, middleware/nav updates, README/AGENTS/.env.example updates, production readiness checklist for `SUPABASE_SERVICE_ROLE_KEY`.

**Out of scope:** Data export, soft-delete/grace period, email confirmation, Supabase provider-token revoke for sign-in-only OAuth, automated test framework, GDPR-specific flows beyond deletion.

## Architecture / Approach

Session-scoped SSR client continues for normal auth. A new server-only admin client (service role, no session persistence) calls `auth.admin.deleteUser()`. The delete API route orchestrates: optional Google revoke using stored calendar refresh token → `IntegrationTokenService.deleteAllTokens()` → admin user delete → `signOut()` → redirect `/`.

```
/settings → two-step confirm → POST /api/account/delete
  → revoke Google (if google_calendar token)
  → delete integration_tokens (jira + google_calendar)
  → admin.deleteUser
  → signOut → /
```

## Phases at a Glance

| Phase                          | What it delivers                                                      | Key risk                                                       |
| ------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1. Deletion backend            | Admin client, bulk token delete, Google revoke helper, error messages | Service role key missing in prod blocks deletion               |
| 2. Settings UI & API           | `/settings` page, delete API, middleware/nav                          | Partial failure after token purge leaves orphan auth user      |
| 3. Docs & production readiness | Env docs, AGENTS/README, hosted secret checklist                      | Same hosted-env gap as F-01/S-01 if secret not set in Wrangler |

**Prerequisites:** S-01 complete; `SUPABASE_SERVICE_ROLE_KEY` available from Supabase Dashboard (Settings → API).

**Estimated effort:** ~1–2 focused sessions across 3 phases.

## Open Risks & Assumptions

- `SUPABASE_SERVICE_ROLE_KEY` must be set in `.env`, `.dev.vars`, and production Wrangler secrets before delete works in each environment.
- Google revoke only runs when S-03-style `google_calendar` refresh token exists; sign-in OAuth grant may linger until manual revoke in Google Account.
- If `admin.deleteUser` fails after tokens are purged, the auth user remains but app data is gone — rare; surfaced as generic error.
- Future user-scoped tables (S-02–S-04) must add `ON DELETE CASCADE` from `auth.users` or be purged in this flow.

## Success Criteria (Summary)

- Authenticated EM deletes account from `/settings`; lands on `/` signed out.
- `integration_tokens` rows for that user are gone; `auth.users` record removed.
- Google refresh token revoked when stored; deletion proceeds when none exists.
- Invalid/unauthenticated delete attempts fail safely; no tokens or PATs in responses or logs.
