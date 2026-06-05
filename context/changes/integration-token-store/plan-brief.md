# Integration Token Store — Plan Brief

> Full plan: `context/changes/integration-token-store/plan.md`

## What & Why

Engineering Managers and sprint assignees need Jira PATs and Google Calendar OAuth tokens persisted securely before any onboarding or calendar-connect UI can ship. F-01 lands the minimal foundation: encrypted Postgres storage and a server-side service contract so S-01/S-03 can wire user flows without redesigning the data layer.

## Starting Point

Supabase handles auth only — cookie SSR client, no migrations, no custom tables, no RLS. Integration tokens are mentioned in the PRD and infrastructure docs but not implemented. Per-user tokens cannot live in Wrangler secrets (those are app-level env vars).

## Desired End State

A single `integration_tokens` table stores AES-GCM ciphertext per `(user_id, provider)`. Owner-only RLS protects rows. `IntegrationTokenService` exposes typed upsert/get/delete/has for `jira` and `google_calendar`. Plaintext tokens never appear in the DB, API responses, or logs. S-01 can immediately call `upsertJiraPat()` from an authenticated route.

## Key Decisions Made

| Decision         | Choice                                 | Why (1 sentence)                                                      |
| ---------------- | -------------------------------------- | --------------------------------------------------------------------- |
| Storage location | Supabase Postgres + app encryption     | Per-user tokens require DB rows; Wrangler secrets are app-global only |
| Encryption key   | `TOKEN_ENCRYPTION_KEY` Wrangler secret | Matches existing `SUPABASE_*` secret pattern; one key for MVP         |
| Schema shape     | Single `integration_tokens` table      | One migration, one service; provider-specific data in encrypted JSON  |
| F-01 scope       | Schema + service only                  | Thin foundation; UI/API deferred to S-01 and S-03                     |
| RLS model        | Owner-only (`auth.uid() = user_id`)    | EM and assignee each own their tokens; simple and correct             |
| Service role     | Deferred to S-04                       | Session client sufficient for self-token flows in S-01/S-03           |
| Calendar payload | access + refresh + expires + scopes    | Enables token refresh without frequent re-consent                     |
| Token lifecycle  | Upsert per (user_id, provider)         | One active token; reconnect overwrites — adequate for MVP             |

## Scope

**In scope:**

- `integration_tokens` migration with RLS and indexes
- AES-GCM encryption helpers (`TOKEN_ENCRYPTION_KEY`)
- `IntegrationTokenService` + `src/types.ts` provider payloads
- Env/docs updates and local verification script

**Out of scope:**

- Onboarding UI, OAuth flows, HTTP API routes
- Service-role client and cross-user token reads
- Jira/Calendar API integration, token rotation UI, audit history

## Architecture / Approach

```
Onboarding API (S-01/S-03, future)
        ↓ session Supabase client
IntegrationTokenService
        ↓ encrypt (AES-GCM)
integration_tokens table (ciphertext column)
        ↑ owner-only RLS
```

Workers read `TOKEN_ENCRYPTION_KEY` from env; encrypt before insert, decrypt after select. All access uses the authenticated user's session client — no service role until S-04 needs assignee calendar data on EM's behalf.

## Phases at a Glance

| Phase                         | What it delivers                                 | Key risk                                                     |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| 1. Database schema & RLS      | `integration_tokens` table, policies, indexes    | First migration in project; local Docker required for verify |
| 2. Encryption & token service | Crypto helpers, types, `IntegrationTokenService` | Edge crypto quirks; must not log plaintext                   |
| 3. Verification & docs        | Smoke script, README/AGENTS env docs             | Script must not echo secrets                                 |

**Prerequisites:** Local Supabase (`npx supabase start`), Docker, existing `SUPABASE_URL`/`SUPABASE_KEY` configured.

**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- S-04 will need `SUPABASE_SERVICE_ROLE_KEY` for cross-user calendar reads — documented but not built in F-01.
- Key rotation requires re-encrypting all rows — acceptable for MVP; no runbook in F-01.
- No automated unit test framework; verification relies on lint/build + manual smoke script.

## Success Criteria (Summary)

- Migration applies; `integration_tokens` exists with owner-only RLS.
- Service round-trips Jira and calendar payloads without leaking plaintext.
- S-01 implementer can call `upsertJiraPat()` without additional schema work.
