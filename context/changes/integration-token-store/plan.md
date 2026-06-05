# Integration Token Store Implementation Plan

## Overview

Land the foundation data layer for securely persisting per-user integration credentials: Jira PAT (EM) and Google Calendar OAuth tokens (assignees). This change delivers the database schema, encryption helpers, and a server-side service contract — no UI or HTTP routes. Downstream slices S-01 and S-03 wire onboarding and OAuth flows against this service.

## Current State Analysis

Supabase is used for auth only today. `src/lib/supabase.ts` creates a cookie-based SSR client; middleware resolves `context.locals.user` via `getUser()`. There are no migrations, custom tables, RLS policies, or `src/types.ts`. The anon key (`SUPABASE_KEY`) is the only Supabase credential in the env schema.

`infrastructure.md` notes integration tokens belong in the database (not Wrangler secrets) because tokens are per-user. The roadmap sequences F-01 first to unblock Jira onboarding (S-01), calendar connect (S-03), and risk computation (S-04).

## Desired End State

After this plan completes:

- A single `integration_tokens` table exists in Supabase with owner-only RLS.
- Token values are stored as AES-GCM ciphertext; plaintext never appears in the database, API responses, or logs.
- `IntegrationTokenService` exposes typed upsert/get/delete/has operations for `jira` and `google_calendar` providers.
- `TOKEN_ENCRYPTION_KEY` is declared in the Astro env schema and documented for local (`.dev.vars`) and production (Wrangler secret) setup.
- S-01 can call `upsertJiraPat()` from an authenticated API route without additional schema work.

### Key Discoveries:

- `src/lib/supabase.ts` — session-scoped client pattern; sufficient for self-token flows in S-01/S-03.
- `wrangler.jsonc` — `nodejs_compat` already enabled; `crypto.subtle` AES-GCM is available at the edge.
- `AGENTS.md` — migrations in `supabase/migrations/`, services in `src/lib/services/`, shared types in `src/types.ts`.
- No test runner in `package.json`; automated verification is lint + build + migration apply.

## What We're NOT Doing

- Google OAuth sign-in or Jira PAT onboarding UI/API (S-01)
- Calendar invite/connect flow (S-03)
- `SUPABASE_SERVICE_ROLE_KEY` / service-role client (deferred to S-04 for cross-user calendar reads)
- Token rotation UI, audit history, or soft-delete
- Jira API calls or Google Calendar API calls
- Public or dev HTTP routes for token CRUD

## Implementation Approach

Three layers, built in order:

1. **Postgres schema** with `(user_id, provider)` uniqueness and owner-only RLS tied to `auth.uid()`.
2. **Encryption helpers** using Web Crypto AES-GCM; key from `TOKEN_ENCRYPTION_KEY` env (32-byte base64).
3. **Service layer** that encrypts before write, decrypts after read, and returns typed payloads — never logs or serializes plaintext.

All database access uses the existing session-scoped Supabase client (authenticated user's JWT). Cross-user reads for sprint analysis are explicitly out of scope and documented as an S-04 dependency.

## Critical Implementation Details

**Encryption wire format:** AES-GCM with a random 12-byte IV prepended to the ciphertext, then base64-encoded for storage in `encrypted_payload`. The implementer must use a constant-time comparison mindset for any future token-equality checks, but MVP only needs encrypt-on-write / decrypt-on-read.

**RLS testing caveat:** Owner-only policies mean manual verification requires either (a) a short-lived local script that signs in as a test user and calls the service, or (b) Supabase local auth with two test accounts. Do not disable RLS for convenience.

## Phase 1: Database Schema & RLS

### Overview

Create the `integration_tokens` table, indexes, updated-at trigger, and owner-only RLS policies.

### Changes Required:

#### 1. Integration tokens migration

**File**: `supabase/migrations/YYYYMMDDHHmmss_integration_tokens.sql`

**Intent**: Define the persistence table for encrypted integration credentials with one active token per user per provider.

**Contract**: Table `integration_tokens` with columns: `id` (uuid PK), `user_id` (uuid FK → `auth.users`, cascade delete), `provider` (text, check constraint `jira` | `google_calendar`), `encrypted_payload` (text, not null), `created_at`, `updated_at`. Unique constraint on `(user_id, provider)`. Index on `user_id`. RLS enabled with policy: `auth.uid() = user_id` for ALL operations. `updated_at` trigger on update.

#### 2. Seed file placeholder

**File**: `supabase/seed.sql` (required — referenced by `supabase/config.toml` with seed enabled)

**Intent**: Satisfy `supabase/config.toml` seed reference so `npx supabase db reset` does not fail on a missing file.

**Contract**: Empty or comment-only SQL file; no seed data for tokens. Create this file in Phase 1 before running automated migration verification.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset` (requires local Docker Supabase) or `npx supabase migration up`
- Linting passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- `integration_tokens` table visible in Supabase Studio after migration
- RLS policy present; inserting a row as user A cannot be read by user B (verify via two test accounts or documented SQL policy check)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Encryption & Token Service

### Overview

Add env wiring, encryption helpers, shared types, and `IntegrationTokenService` with typed provider payloads.

### Changes Required:

#### 1. Env schema for encryption key

**File**: `astro.config.mjs`

**Intent**: Declare `TOKEN_ENCRYPTION_KEY` as a server-only secret alongside existing Supabase vars.

**Contract**: `envField.string({ context: "server", access: "secret", optional: true })` for `TOKEN_ENCRYPTION_KEY`. Import in encryption module via `astro:env/server`.

**File**: `.env.example`

**Intent**: Document the new secret for local setup.

**Contract**: Add `TOKEN_ENCRYPTION_KEY=` with a comment: generate via `openssl rand -base64 32`.

#### 2. Token encryption helpers

**File**: `src/lib/crypto/token-encryption.ts`

**Intent**: Encrypt and decrypt token payloads at the application layer before Postgres write/read.

**Contract**: Export `encryptTokenPayload(plaintext: string, key: string): Promise<string>` and `decryptTokenPayload(ciphertext: string, key: string): Promise<string>`. AES-GCM, 12-byte IV prepended, base64 output. Throw a typed error if key is missing or ciphertext is invalid. Never log plaintext or key material.

#### 3. Shared integration types

**File**: `src/types.ts`

**Intent**: Define provider enums and decrypted payload shapes used by the service and downstream slices.

**Contract**:

- `IntegrationProvider`: `'jira' | 'google_calendar'`
- `JiraTokenPayload`: `{ pat: string; siteUrl?: string }` (siteUrl optional for future Jira Cloud base URL)
- `GoogleCalendarTokenPayload`: `{ accessToken: string; refreshToken: string; expiresAt: string; scopes: string[] }`
- `IntegrationTokenRow`: database row shape (id, userId, provider, encryptedPayload, createdAt, updatedAt) — no plaintext fields

#### 4. Integration token service

**File**: `src/lib/services/integration-token-service.ts`

**Intent**: Single service entry point for all token persistence; downstream slices call this instead of raw Supabase queries.

**Contract**: Class or module `IntegrationTokenService` constructed with a Supabase client (session-scoped). Callers must pass the authenticated user's ID (e.g. `context.locals.user.id` from API routes); a mismatched `userId` fails at RLS with a PostgREST error, not a service-level validation message. Methods:

- `upsertJiraPat(userId, payload: JiraTokenPayload): Promise<void>`
- `upsertGoogleCalendarTokens(userId, payload: GoogleCalendarTokenPayload): Promise<void>`
- `getJiraPat(userId): Promise<JiraTokenPayload | null>`
- `getGoogleCalendarTokens(userId): Promise<GoogleCalendarTokenPayload | null>`
- `deleteToken(userId, provider: IntegrationProvider): Promise<void>`
- `hasToken(userId, provider: IntegrationProvider): Promise<boolean>`

Upsert uses `onConflict: 'user_id,provider'`. Serialize typed payloads with `JSON.stringify` before encrypt; `JSON.parse` after decrypt inside provider-specific methods. Return `null` when no row exists. On decrypt failure, throw — do not return partial data. Methods must not `console.log` payloads. Generic `getDecryptedPayload` internals are fine but not exported to callers outside the service.

#### 5. Config status banner (optional touch)

**File**: `src/lib/config-status.ts`

**Intent**: Surface missing `TOKEN_ENCRYPTION_KEY` in the existing config banner when Supabase is configured but encryption is not.

**Contract**: Add `TOKEN_ENCRYPTION_KEY` to the missing-config check list so developers see the gap before hitting runtime encrypt errors.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build passes: `npm run build`
- TypeScript check passes: `npx astro check` (if available via `@astrojs/check`; otherwise covered by build)

#### Manual Verification:

- Round-trip test: encrypt → store via service → read → decrypt returns original Jira PAT and calendar payload shapes (ad-hoc during Phase 2 dev; repeatable via Phase 3 script)
- Confirm no plaintext appears in Worker/terminal logs during round-trip
- Confirm service throws clear error when `TOKEN_ENCRYPTION_KEY` is unset

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Verification Script & Documentation

### Overview

Add a local-only verification script and update project docs so S-01 implementers know how to configure secrets and call the service.

### Changes Required:

#### 1. Local verification script

**File**: `scripts/verify-integration-tokens.mts`

**Intent**: Provide a repeatable manual smoke test for the service without adding HTTP routes.

**Contract**: Node ESM script (run with `npx tsx` or documented alternative) that:

1. Checks required env vars are present (`SUPABASE_URL`, `SUPABASE_KEY`, `TOKEN_ENCRYPTION_KEY`).
2. Performs in-memory encrypt/decrypt round-trip on sample Jira and calendar payloads.
3. Signs in to local Supabase with documented test credentials, constructs a session-scoped Supabase client, and exercises `IntegrationTokenService` upsert/get/has/delete for both providers.
4. Optionally verifies cross-user isolation (user B cannot read user A's row) when a second test account is configured.
5. Prints pass/fail summary without echoing secrets.

Script is dev-only; not imported by production code. Add `tsx` as devDependency only if needed for execution. Document test-user setup (email/password for one or two local accounts) in README or script header comment.

#### 2. AGENTS.md data-layer note

**File**: `AGENTS.md`

**Intent**: Document the new env var and service location for future agents.

**Contract**: Add `TOKEN_ENCRYPTION_KEY` to Environment section. Note `src/lib/services/integration-token-service.ts` and `supabase/migrations/*_integration_tokens.sql`. State: tokens must never be logged or returned to client UI.

#### 3. README secrets section

**File**: `README.md`

**Intent**: Human-facing setup instructions for the encryption key.

**Contract**: Document `TOKEN_ENCRYPTION_KEY` generation and placement in `.env` / `.dev.vars` / Wrangler secret. Note service-role is not required until S-04.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Verification script runs successfully against local Supabase with test credentials (crypto round-trip + service upsert/get/has/delete + optional RLS isolation check)
- `.env.example` and README accurately list all three secrets: `SUPABASE_URL`, `SUPABASE_KEY`, `TOKEN_ENCRYPTION_KEY`
- Reviewer confirms plan's "What We're NOT Doing" items were not implemented

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No test framework in project today; defer automated unit tests unless `vitest` is added in a separate change.
- Encryption round-trip and service persistence are covered by `scripts/verify-integration-tokens.mts` (manual/smoke).

### Integration Tests:

- Deferred to S-01 when Jira PAT save API route provides an end-to-end authenticated path.

### Manual Testing Steps:

1. `npx supabase start` → `npx supabase db reset` → confirm `integration_tokens` table and RLS in Studio.
2. Set `TOKEN_ENCRYPTION_KEY`, `SUPABASE_URL`, `SUPABASE_KEY` in `.env`.
3. Run verification script; confirm pass without secret leakage in output.
4. Attempt cross-user read (user B cannot select user A's row) via Supabase client or documented policy test.
5. Confirm `npm run build` succeeds with new env schema field present.

## Performance Considerations

Token operations are infrequent (onboarding, reconnect, token refresh). AES-GCM encrypt/decrypt per request is negligible. No caching needed. Single-row lookups by `(user_id, provider)` are indexed.

## Migration Notes

- First migration in this project; establish `supabase/migrations/` directory.
- Production: apply via `npx supabase db push` or Supabase dashboard migration before deploying code that calls the service.
- Worker rollback does not revert DB migrations — plan migrations separately per `infrastructure.md`.
- Key rotation (post-MVP): re-encrypt all rows with a new `TOKEN_ENCRYPTION_KEY`; not in scope for F-01.

## References

- PRD guardrails: `context/foundation/prd.md` (Access Control, NFR)
- Roadmap F-01: `context/foundation/roadmap.md`
- Infrastructure secrets guidance: `context/foundation/infrastructure.md`
- Supabase client pattern: `src/lib/supabase.ts`
- GitHub issue: [#1](https://github.com/Marce1ina/sprint-capacity-intelligence/issues/1)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database Schema & RLS

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` (requires local Docker Supabase) or `npx supabase migration up` — e41b859
- [x] 1.2 Linting passes: `npm run lint` — e41b859
- [x] 1.3 Build passes: `npm run build` — e41b859

#### Manual

- [x] 1.4 `integration_tokens` table visible in Supabase Studio after migration — e41b859
- [x] 1.5 RLS policy present; inserting a row as user A cannot be read by user B (verify via two test accounts or documented SQL policy check) — e41b859

### Phase 2: Encryption & Token Service

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — ffdc7aa
- [x] 2.2 Build passes: `npm run build` — ffdc7aa
- [x] 2.3 TypeScript check passes: `npx astro check` (if available via `@astrojs/check`; otherwise covered by build) — ffdc7aa

#### Manual

- [x] 2.4 Round-trip test: encrypt → store via service → read → decrypt returns original Jira PAT and calendar payload shapes — ffdc7aa
- [x] 2.5 Confirm no plaintext appears in Worker/terminal logs during round-trip — ffdc7aa
- [x] 2.6 Confirm service throws clear error when `TOKEN_ENCRYPTION_KEY` is unset — ffdc7aa

### Phase 3: Verification Script & Documentation

#### Automated

- [x] 3.1 Linting passes: `npm run lint`
- [x] 3.2 Build passes: `npm run build`

#### Manual

- [x] 3.3 Verification script runs successfully against local Supabase with test credentials (crypto + service + optional RLS)
- [x] 3.4 `.env.example` and README accurately list all three secrets: `SUPABASE_URL`, `SUPABASE_KEY`, `TOKEN_ENCRYPTION_KEY`
- [x] 3.5 Reviewer confirms plan's "What We're NOT Doing" items were not implemented
