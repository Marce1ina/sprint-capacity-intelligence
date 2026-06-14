# Google Sign-in and Jira PAT Onboarding — Plan Brief

> Full plan: `context/changes/google-auth-jira-onboarding/plan.md`
> Research: `context/changes/google-auth-jira-onboarding/research.md`

## What & Why

S-01 delivers the EM onboarding critical path: sign in with Google (FR-001) and configure Jira with a validated Personal Access Token (FR-002). Without this slice, no downstream sprint picker or risk table work can proceed — Google identity gates the product and Jira credentials feed S-02.

## Starting Point

Email/password Supabase SSR auth exists (`createClient`, middleware, `/dashboard` guard). F-01 landed encrypted token persistence via `IntegrationTokenService`. Google OAuth, callback handling, onboarding UI, and Jira API validation are all net-new.

## Desired End State

An EM clicks "Continue with Google", completes Google consent, lands on `/onboarding`, enters a Jira PAT and site URL, passes live validation against Jira REST API, and reaches `/dashboard` with credentials encrypted in `integration_tokens`. Returning users skip onboarding. Email/password auth is removed from the product.

## Key Decisions Made

| Decision           | Choice                               | Why (1 sentence)                                                                     | Source   |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------------------------ | -------- |
| Post-login routing | Onboarding-first                     | Callback → `/onboarding`; middleware forwards to `/dashboard` when Jira token exists | Plan     |
| Sign-in methods    | Google-only UI                       | Matches PRD FR-001; remove email/password pages and routes                           | Plan     |
| Onboarding UX      | Single `/onboarding` page            | Fastest path under time pressure; one form for PAT + site URL                        | Plan     |
| Jira form fields   | PAT + site URL (required in form)    | Optional in type but required for live API validation                                | Plan     |
| PAT validation     | Live Jira API (`/rest/api/3/myself`) | Immediate feedback on bad tokens before S-02                                         | Plan     |
| Middleware scope   | Guard `/dashboard` + `/onboarding`   | Enforce auth and Jira completion with `hasToken('jira')`                             | Plan     |
| OAuth callback     | Always `/onboarding`                 | Consistent with onboarding-first routing                                             | Research |
| Calendar OAuth     | Out of scope                         | S-03 separate flow; no Calendar scopes at sign-in                                    | Research |
| Phase structure    | OAuth → onboarding → cleanup         | Test Google sign-in before Jira work                                                 | Plan     |

## Scope

**In scope:** Supabase/Google config docs, OAuth API routes, Google sign-in UI, `/onboarding` page, Jira validation client, PAT save API, middleware guards, legacy auth removal, README/AGENTS updates.

**Out of scope:** Calendar connect (S-03), sprint picker (S-02), service-role client, automated tests, Supabase Dashboard clicks (documented only).

## Architecture / Approach

Two-hop Supabase PKCE OAuth (`/api/auth/google` → Google → `/api/auth/callback` → session cookies) using the existing SSR client. Middleware checks auth + `IntegrationTokenService.hasToken('jira')` to route between `/onboarding` and `/dashboard`. Onboarding POST validates PAT against Jira Cloud REST API, then encrypts via F-01 service.

```
Sign in → Google OAuth → /onboarding → validate Jira → upsertJiraPat → /dashboard
```

## Phases at a Glance

| Phase              | What it delivers                                  | Key risk                                                  |
| ------------------ | ------------------------------------------------- | --------------------------------------------------------- |
| 1. Google OAuth    | Config, OAuth routes, Google-only sign-in UI      | Redirect URL misconfiguration (Google vs Supabase vs app) |
| 2. Jira onboarding | Validator, onboarding page/API, middleware guards | Jira API auth format; middleware DB round-trip            |
| 3. Cleanup + docs  | Remove email auth, update landing/README/AGENTS   | Breaking local scripts that relied on email sign-in UI    |

**Prerequisites:** F-01 complete; Google Cloud OAuth client + Supabase Google provider configured (user-owned); `TOKEN_ENCRYPTION_KEY` set locally and in production.

**Estimated effort:** ~2–3 focused sessions across 3 phases.

## Open Risks & Assumptions

- User completes Supabase Dashboard + Google Cloud setup before production deploy (documented, not automated).
- Jira Cloud PAT accepts `Authorization: Bearer` against `/rest/api/3/myself` — verify during Phase 2 implementation.
- Existing dev email/password users must use Google with same email; no custom linking UX.
- `hasToken()` per protected request is acceptable latency for MVP EM traffic.

## Success Criteria (Summary)

- EM signs in with Google and reaches onboarding without email/password.
- Valid Jira PAT + site URL saves encrypted and unlocks `/dashboard`.
- Invalid PAT rejected with safe error; secrets never exposed in UI or logs.
