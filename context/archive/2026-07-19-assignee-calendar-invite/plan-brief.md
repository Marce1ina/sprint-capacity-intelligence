# Assignee Calendar Invite — Plan Brief

> Full plan: `context/changes/assignee-calendar-invite/plan.md`
> Research: `context/changes/assignee-calendar-invite/research.md`

## What & Why

Roadmap slice S-03 (FR-004, FR-005): let an EM invite sprint assignees to connect Google Calendar via a shareable link, and let the assignee connect via that link. This is the last prerequisite before S-04's per-person sprint risk table — without connected calendars, there's no meeting data to compute risk from.

## Starting Point

Google Calendar token storage was deliberately built ahead of schedule in F-01: schema, encryption, `IntegrationTokenService.upsertGoogleCalendarTokens`/`getGoogleCalendarTokens`, and account-deletion revoke logic already exist and work. What's missing is everything else — the invite mechanism (zero scaffolding: no table, route, type, or component) and the OAuth route that actually populates those already-built token methods.

## Desired End State

An EM clicks "Invite" next to an assignee row, gets a link copied to their clipboard, and shares it however they like. The assignee opens the link, sees which sprint they're being asked to connect for, clicks "Connect Google Calendar," completes Google's consent screen, and lands on a confirmation page. Their calendar tokens are now stored, ready for S-04 to consume. Revisiting the link afterward shows it's already used, never the connect flow again.

## Key Decisions Made

| Decision                 | Choice                                                                                                     | Why (1 sentence)                                                                                                                       | Source |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| OAuth mechanism          | Reuse Supabase's existing Google OAuth, calendar scope requested only on the invite route                  | Zero new Google Cloud OAuth client, reuses 100% of existing token storage/encryption; keeps EM sign-in scope-free per a prior decision | Plan   |
| Invite data model        | New `sprint_invites` table, one row per (sprint, assignee) ever                                            | EM needs to know an invite already exists/was used when clicking Invite twice; supports the strict single-use behavior below for free  | Plan   |
| Assignee correlation     | No email field added — EM copies a link, no automated delivery                                             | Matches roadmap's already-committed shareable-link default exactly; smallest scope                                                     | Plan   |
| Re-visit behavior        | Strictly single-use — consumed link is a hard error (except right after the user's own successful connect) | Simplest possible state machine; user explicitly chose this over an idempotent/expiring model                                          | Plan   |
| Existing-account overlap | Let Supabase resolve to the visitor's existing account naturally; no dedupe code                           | Free byproduct of `upsert-by-(user_id, provider)` semantics already in `IntegrationTokenService`                                       | Plan   |
| Cross-user token access  | Centralize `createAdminClient` into one new helper file (`invite-api-context.ts`)                          | Keeps the repo's `service-role-boundary.test.ts` guardrail a one-line update instead of scattering privileged access                   | Plan   |
| Test coverage            | Minimal — happy-path tests only                                                                            | User explicitly chose speed over closing the pre-existing RLS/mock test gaps this slice touches                                        | Plan   |

## Scope

**In scope:**

- `sprint_invites` table + service layer
- EM-side invite generation (route + Copy Link button in the assignee table)
- Public invite landing page + Google OAuth start/callback routes
- Production-readiness checklist for the Google Cloud Console / hosted Supabase config this feature touches

**Out of scope:**

- Email delivery, invite expiry/resend, new Google Cloud OAuth client, bulk invites, connection-status UI in the dashboard, actually reading calendar events (S-04), RLS/secret-scan hardening beyond the minimum to test the new routes, Google app-verification process

## Architecture / Approach

One new table tracks invite lifecycle by opaque token. EM-side creation runs under the EM's own RLS session (`auth.uid() = invited_by` covers it). The assignee-side read/consume path needs cross-user access and is the one place using `createAdminClient`, centralized into a single helper so the existing guardrail test needs only one new allowlist entry. The OAuth flow itself is a normal `supabase.auth.signInWithOAuth` call with `calendar.readonly` scope, `access_type=offline`, and `prompt=consent` — no new external service, just an additional scope on one route — landing on the already-built `IntegrationTokenService` to persist tokens.

## Phases at a Glance

| Phase                                  | What it delivers                                                             | Key risk                                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Data model & invite service         | `sprint_invites` table, service, admin-access helper, guardrail/mock updates | Getting the RLS/admin-access split wrong would either block the EM or leak cross-user data                                              |
| 2. EM-side invite generation           | Invite creation route + Copy Link button in the assignee table               | Low risk — additive UI + simple authenticated route                                                                                     |
| 3. Assignee-side connect flow          | Public landing page + OAuth start/callback routes                            | Missing refresh token or wrong redirect allow-list breaks the flow silently                                                             |
| 4. Production readiness & verification | Google Cloud Console checklist, hosted config confirmation, minimal tests    | **Google consent-screen "Testing" status can block real assignees from connecting at all** — this is a product/ops risk, not a code fix |

**Prerequisites:** S-02 (jira-sprint-picker) shipped; F-01 token storage already in place.
**Estimated effort:** ~1-2 after-hours sessions across the 4 phases.

## Open Risks & Assumptions

- **Google OAuth consent-screen publishing status.** If the app's Google Cloud project is unverified ("Testing" mode), only pre-registered test-user Google accounts (max 100) can complete the calendar-scope consent — real assignees outside that list will hit a Google-side block, not an app error. Not solvable in this plan; must be tracked as an MVP limitation or escalated to Google's verification process separately.
- **Assignees get a real Supabase account.** A side effect of reusing Supabase's OAuth is that connecting calendar access creates a full app account for the assignee. They can reach `/settings` (exempt from the Jira-onboarding gate) but would hit a confusing redirect loop if they ever visited `/dashboard` with no Jira PAT — low-severity, self-inflicted, not fixed here.
- **Minimal test coverage was explicitly chosen** — the pre-existing RLS test gap for `google_calendar` rows and incomplete service mock remain open beyond what's newly required to test this slice's own routes.

## Success Criteria (Summary)

- EM can generate and copy an invite link per assignee row, and the unassigned row correctly has no invite action.
- An assignee can complete the link → connect → confirmation flow, and a `google_calendar` token row appears for their account.
- Revisiting a consumed link never re-offers the connect flow.
