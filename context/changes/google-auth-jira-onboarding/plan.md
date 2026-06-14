# Google Sign-in and Jira PAT Onboarding Implementation Plan

## Overview

Deliver S-01 (`google-auth-jira-onboarding`): EM signs in with Google (FR-001) and configures Jira access with a validated Personal Access Token during a single onboarding page (FR-002). Builds on the completed F-01 `IntegrationTokenService` and the existing Supabase SSR cookie auth scaffold.

## Current State Analysis

- **Auth:** Email/password only — `signInWithPassword` via `POST /api/auth/signin`; no Google OAuth routes or callback handler (`context/changes/google-auth-jira-onboarding/research.md`).
- **SSR client:** `src/lib/supabase.ts` — cookie-based `createServerClient`; reusable for OAuth start and callback.
- **Middleware:** `src/middleware.ts` — resolves `context.locals.user` via `getUser()`; protects `/dashboard` only.
- **Token store (F-01 complete):** `IntegrationTokenService.upsertJiraPat()` / `hasToken()` ready in `src/lib/services/integration-token-service.ts`.
- **Supabase local config:** `site_url` uses port `3000`; Astro dev uses `4321`; no `[auth.external.google]` block.
- **No Jira API client** exists yet — validation is net-new (user chose live API validation in planning).

### Key Discoveries:

- OAuth is a two-hop PKCE flow: Google → Supabase `/auth/v1/callback` → app `/api/auth/callback?code=` → `exchangeCodeForSession` (`research.md`).
- Google client ID/secret live in Supabase config, not Astro env — existing `SUPABASE_URL` / `SUPABASE_KEY` suffice at the Worker layer.
- S-03 Calendar OAuth is a separate flow — do not add Calendar scopes to sign-in OAuth.
- F-01 deferred HTTP error mapping to S-01 API routes (`context/changes/integration-token-store/reviews/impl-review.md:64-75`).

## Desired End State

After this plan completes:

- EM can sign in with Google on production and local dev (with Supabase + Google Cloud configured).
- OAuth callback lands on `/onboarding`; users with a saved Jira PAT reach `/dashboard`; users without are kept on `/onboarding`.
- Single `/onboarding` page collects Jira PAT + site URL, validates credentials against Jira REST API, then encrypts and stores via `IntegrationTokenService`.
- Email/password sign-in UI and routes are removed; sign-out remains.
- `npm run lint` and `npm run build` pass.

### Verification:

1. Local: Google sign-in → `/onboarding` → valid PAT + site URL → `/dashboard`.
2. Invalid PAT rejected with user-friendly error; PAT never appears in responses or logs.
3. Authenticated user with Jira token visiting `/onboarding` redirects to `/dashboard`.
4. Unauthenticated user visiting `/dashboard` or `/onboarding` redirects to `/auth/signin`.

## What We're NOT Doing

- Google Calendar connect / invite flow (S-03)
- Full Jira sprint picker or assignee APIs (S-02) — only minimal `GET /rest/api/3/myself` validation
- Email/password sign-in or sign-up (removed per planning decision)
- Service-role Supabase client
- Account linking UX for existing email/password users (Supabase default behavior applies)
- Automated test framework (project has none; lint + build + manual verification)
- Supabase Dashboard / Google Cloud Console clicks (user-owned manual setup; documented in Phase 1)

## Implementation Approach

Three incremental phases:

1. **Google OAuth** — external config docs, local `config.toml`, OAuth API routes, Google-only sign-in UI. Test sign-in end-to-end before Jira work.
2. **Jira onboarding** — minimal Jira validation client, onboarding page + save API, middleware routing guards with `hasToken('jira')`.
3. **Legacy cleanup + docs** — remove email/password pages and API routes, update landing/README/AGENTS.md.

## Critical Implementation Details

**Site URL required in form:** User chose optional `siteUrl` in the payload type but live Jira API validation. The onboarding form must require site URL (normalized Atlassian Cloud base URL, e.g. `https://yourorg.atlassian.net`) because validation cannot run without it. Store in `JiraTokenPayload.siteUrl` on successful save.

**Middleware token check:** Calling `IntegrationTokenService.hasToken()` on protected routes adds one DB round-trip per request. Acceptable for MVP; cache not needed yet.

**OAuth callback destination:** Always redirect to `/onboarding` after successful `exchangeCodeForSession` — middleware handles forwarding to `/dashboard` when Jira token exists.

## Phase 1: Google OAuth Provider & Sign-in

### Overview

Enable Google as the sole sign-in method: Supabase local config, OAuth start/callback API routes, and sign-in UI refactor. Callback sends users to `/onboarding`.

### Changes Required:

#### 1. Local Supabase Google provider config

**File**: `supabase/config.toml`

**Intent**: Align local auth URLs with Astro dev port and enable Google provider for `supabase start`.

**Contract**: Update `[auth]` `site_url` to `http://127.0.0.1:4321`; expand `additional_redirect_urls` with `4321` and production Workers wildcard. Add `[auth.external.google]` with `enabled = true`, `client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"`, `secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"`, `redirect_uri = "http://127.0.0.1:54321/auth/v1/callback"`, `skip_nonce_check = true`.

#### 2. OAuth setup documentation

**File**: `README.md` (Supabase Configuration section)

**Intent**: Document user-owned Google Cloud + Supabase Dashboard steps so OAuth works in hosted and local environments.

**Contract**: New subsection covering: Google Cloud Web OAuth client (redirect URIs point to Supabase `/auth/v1/callback`, not the app); Supabase Dashboard Google provider + Redirect URLs allow list (`/api/auth/callback` on app origin); local `.env` vars `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` for `supabase start`; production Site URL = Workers domain.

#### 3. OAuth start route

**File**: `src/pages/api/auth/google.ts`

**Intent**: Initiate Supabase Google OAuth PKCE flow server-side.

**Contract**: `export const prerender = false`; `GET` handler using `createClient` → `signInWithOAuth({ provider: 'google', options: { redirectTo: `${origin}/api/auth/callback` } })` → redirect to `data.url`. On error, redirect to `/auth/signin?error=...`.

#### 4. OAuth callback route

**File**: `src/pages/api/auth/callback.ts`

**Intent**: Exchange authorization code for session cookies.

**Contract**: `export const prerender = false`; `GET` handler reads `code` query param; `exchangeCodeForSession(code)` via `createClient`; on success redirect to `/onboarding`; on failure redirect to `/auth/signin?error=...`. Reject missing `code`.

#### 5. Google-only sign-in UI

**File**: `src/pages/auth/signin.astro`

**Intent**: Replace email/password entry with Google sign-in CTA.

**Contract**: Primary action links to `GET /api/auth/google` ("Continue with Google"). Remove signup link. Retain error display from `?error=` param.

**File**: `src/components/auth/SignInForm.tsx`

**Intent**: Replace email/password form with Google sign-in button component or inline link; remove unused form state/validation.

**Contract**: No POST to `/api/auth/signin`. Match existing cosmic card styling; use shadcn `Button` if adding a button.

#### 6. Export prerender on sign-out

**File**: `src/pages/api/auth/signout.ts`

**Intent**: Align with AGENTS.md API route convention.

**Contract**: Add `export const prerender = false`.

#### 7. Stub onboarding page

**File**: `src/pages/onboarding.astro`

**Intent**: Provide a valid OAuth callback landing target before Phase 2 builds the full Jira form.

**Contract**: Minimal Astro page using existing `Layout`; placeholder copy (e.g. "Jira setup coming next"). No form or API calls. Phase 2 replaces this stub with the full onboarding experience.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Supabase local config: `supabase stop && supabase start` succeeds after `config.toml` changes
- Google sign-in (local or hosted): click "Continue with Google" → Google consent → lands on `/onboarding` with session (user visible in middleware/`locals`)
- OAuth failure surfaces readable error on `/auth/signin`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that Google OAuth manual testing was successful before proceeding to Phase 2.

---

## Phase 2: Jira Onboarding, Validation & Routing

### Overview

Single `/onboarding` page, Jira PAT validation against Atlassian REST API, encrypted persistence, and middleware guards for onboarding-first routing.

### Changes Required:

#### 0. Verify Jira PAT auth header format (spike)

**Intent**: Confirm which Authorization header Atlassian Cloud accepts for PAT validation before building the client.

**Contract**: Manually test `GET /rest/api/3/myself` against a real Jira Cloud site with Bearer PAT and, if needed, Basic auth (`email:token`). Record chosen format in Phase 2 implementation notes and apply it in `jira-client.ts` below. ~15 minutes; blocks validator coding if skipped.

#### 1. Jira credentials validator

**File**: `src/lib/services/jira-client.ts`

**Intent**: Minimal server-side client to verify PAT + site URL before persistence; reusable by S-02 later.

**Contract**: Export `validateJiraCredentials(siteUrl: string, pat: string): Promise<void>`. Normalize `siteUrl` (trim, strip trailing slash, ensure `https://`). Use Authorization header format confirmed in spike (default: `Bearer ${pat}`). `fetch(`${siteUrl}/rest/api/3/myself`, { headers: { Authorization: <confirmed format>, Accept: 'application/json' } })`. Throw typed `JiraValidationError` with safe user-facing messages for 401/403/404/network failures. Never log PAT. No other Jira endpoints in S-01.

#### 2. Onboarding API route

**File**: `src/pages/api/onboarding/jira.ts`

**Intent**: Authenticated endpoint to validate and save Jira credentials.

**Contract**: `export const prerender = false`; `POST` handler. Require `context.locals.user`; if absent, redirect to `/auth/signin?error=...` (no JSON responses). Read `pat` and `siteUrl` from form body. Validate non-empty. Call `validateJiraCredentials(siteUrl, pat)`. Construct `IntegrationTokenService` with session Supabase client + `TOKEN_ENCRYPTION_KEY` from `astro:env/server`. Call `upsertJiraPat(user.id, { pat, siteUrl })`. Map validation, service, and PostgREST errors to generic messages; redirect to `/onboarding?error=...` on failure (no internal details). Redirect to `/dashboard` on success. Never return PAT in response body.

#### 3. Onboarding page and form

**File**: `src/pages/onboarding.astro`

**Intent**: Replace Phase 1 stub with single-page Jira PAT setup after Google sign-in.

**Contract**: Astro page using existing `Layout`; requires authenticated user (middleware). Read `?error=` query param and pass to form island. Renders React island for the form. Headline explaining Jira PAT requirement; link to Atlassian PAT docs.

**File**: `src/components/onboarding/JiraPatForm.tsx`

**Intent**: Collect PAT and site URL with client-side validation (non-empty, site URL format).

**Contract**: Form `POST` to `/api/onboarding/jira`. Fields: `pat` (password input), `siteUrl` (url/text input, required). Display server errors via `ServerError` from `?error=` query param (same pattern as sign-in). Use existing auth form primitives (`FormField`, `SubmitButton`, `ServerError`) where applicable. Hooks in `src/components/hooks/` if state logic grows.

#### 4. Middleware onboarding guards

**File**: `src/middleware.ts`

**Intent**: Enforce auth + Jira onboarding completion routing.

**Contract**: Expand protected routes to include `/dashboard` and `/onboarding`. When user authenticated: wrap `hasToken(user.id, 'jira')` in try/catch — on PostgREST error, log safely (no tokens) and call `next()` without onboarding redirects (fail-open degraded guard). On success: if path starts with `/dashboard` and no Jira token, redirect `/onboarding`; if path starts with `/onboarding` and has Jira token, redirect `/dashboard`. When user not authenticated and path is protected, redirect `/auth/signin`. Keep `/api/auth/*` and `/api/onboarding/*` outside redirect loops (API routes handle their own auth). Pass `TOKEN_ENCRYPTION_KEY` (or empty string) to `IntegrationTokenService` constructor — key unused by `hasToken()` but required by constructor.

**File**: `src/env.d.ts` (only if needed)

**Intent**: No change expected — `locals.user` already typed.

#### 5. Jira validation error type

**File**: `src/types.ts` or colocated with jira-client

**Intent**: Typed error for API route mapping.

**Contract**: `JiraValidationError` class or discriminated error shape with `userMessage: string` safe for UI.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- New Google user lands on `/onboarding`; cannot reach `/dashboard` until PAT saved
- Valid PAT + site URL → saves → redirects to `/dashboard`; `hasToken('jira')` returns true
- Invalid PAT → error on onboarding page; no row written to `integration_tokens`
- Returning user with Jira token visiting `/onboarding` redirects to `/dashboard`
- PAT and site URL never appear in browser network response bodies or server logs

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that onboarding manual testing was successful before proceeding to Phase 3.

---

## Phase 3: Legacy Auth Removal & Documentation

### Overview

Remove email/password auth surfaces, update landing/marketing copy, and document the new auth + onboarding flow for agents and developers.

### Changes Required:

#### 1. Remove email/password pages

**Files to delete**: `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`

**Intent**: Eliminate non-Google auth entry points per PRD.

#### 2. Remove email/password API routes

**Files to delete**: `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`

**Intent**: Remove unused auth endpoints. Keep `signout.ts`.

#### 3. Remove unused auth components

**Files to delete or trim**: `src/components/auth/SignUpForm.tsx`; trim `SignInForm.tsx` if replaced entirely in Phase 1.

**Intent**: Remove dead code; keep shared primitives (`FormField`, `PasswordToggle` if reused by onboarding PAT field, `SubmitButton`, `ServerError`).

#### 4. Update landing and nav CTAs

**Files**: `src/components/Welcome.astro`, `src/components/Topbar.astro`

**Intent**: Remove "Sign Up" links; single "Sign In" → `/auth/signin` (Google flow) in hero and top nav.

**Contract**: Update Welcome feature card copy from "sign in, sign up" to Google sign-in + Jira onboarding. Remove Topbar `/auth/signup` link; keep sign-in link for unauthenticated users.

#### 5. Update README auth route table

**File**: `README.md` (auth routes section)

**Intent**: Remove email/password and confirm-email route rows; document Google OAuth and onboarding routes.

**Contract**: Replace sign-up/sign-in API route entries with `/api/auth/google`, `/api/auth/callback`, `/onboarding`, and `/api/onboarding/jira`. Align with Phase 1 OAuth setup docs.

#### 6. Update AGENTS.md

**File**: `AGENTS.md`

**Intent**: Document Google OAuth routes, onboarding flow, and Jira client location for future agents.

**Contract**: Auth section notes: Google OAuth via `/api/auth/google` + `/api/auth/callback`; onboarding at `/onboarding`; Jira PAT via `IntegrationTokenService`; no email/password auth.

#### 7. Update F-01 verification script note (optional)

**File**: `scripts/verify-integration-tokens.mts` header comment

**Intent**: Note that script may still use Supabase admin/API directly or document that email sign-up for test users is a dev-only Supabase Studio operation — not via removed UI routes.

**Contract**: Comment-only update if script referenced email sign-in UI; script itself can keep using Supabase auth API programmatically for token store testing.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build passes: `npm run build`
- No remaining imports/references to deleted signin/signup routes or `/auth/signup` links (grep `Topbar`, `Welcome`, and auth paths)

#### Manual Verification:

- Landing page shows single sign-in CTA; no signup link
- `/auth/signup` returns 404
- Full flow still works: Google sign-in → onboarding → dashboard → sign out
- README and AGENTS.md accurately describe Google + Jira onboarding setup

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that cleanup and documentation are complete.

---

## Testing Strategy

### Unit Tests:

- No test framework in project; defer automated unit tests.
- Jira validator and error mapping covered by manual onboarding tests.

### Integration Tests:

- End-to-end flow is manual: Google OAuth → onboarding → dashboard (Phase 1 + 2 manual criteria).

### Manual Testing Steps:

1. Configure Google Cloud + Supabase Dashboard per README.
2. Local: `supabase start`, set Google env vars, `npm run dev`.
3. Sign in with Google → confirm `/onboarding`.
4. Submit invalid PAT → confirm error, no DB row.
5. Submit valid PAT + site URL → confirm `/dashboard`, token row in Studio (encrypted payload only).
6. Sign out, sign in again → confirm direct to `/dashboard` (skip onboarding).
7. Production smoke on Workers domain with hosted Supabase redirect URLs.

## Performance Considerations

- One `hasToken()` DB lookup per request to protected routes — negligible for MVP EM traffic.
- Jira validation is one HTTP request during onboarding only — not on every page load.

## Migration Notes

- No database schema changes — F-01 migration already applied.
- Existing email/password Supabase users (if any from dev) may need to sign in with Google using the same email; account linking is Supabase-default — no custom UX in S-01.
- Production deploy order: configure Supabase Dashboard Google provider + redirect URLs **before** deploying code that removes email sign-in.

## References

- Research: `context/changes/google-auth-jira-onboarding/research.md`
- F-01 plan: `context/changes/integration-token-store/plan.md`
- PRD FR-001/FR-002: `context/foundation/prd.md`
- Roadmap S-01: `context/foundation/roadmap.md`
- Supabase SSR client: `src/lib/supabase.ts`
- Token service: `src/lib/services/integration-token-service.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Google OAuth Provider & Sign-in

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — d201228
- [x] 1.2 Build passes: `npm run build` — d201228

#### Manual

- [x] 1.3 Supabase local config: `supabase stop && supabase start` succeeds after `config.toml` changes — d201228
- [x] 1.4 Google sign-in (local or hosted): click "Continue with Google" → Google consent → lands on `/onboarding` with session — d201228
- [x] 1.5 OAuth failure surfaces readable error on `/auth/signin` — d201228

### Phase 2: Jira Onboarding, Validation & Routing

#### Automated

- [x] 2.1 Linting passes: `npm run lint`
- [x] 2.2 Build passes: `npm run build`

#### Manual

- [x] 2.3 New Google user lands on `/onboarding`; cannot reach `/dashboard` until PAT saved
- [x] 2.4 Valid PAT + site URL → saves → redirects to `/dashboard`; `hasToken('jira')` returns true
- [x] 2.5 Invalid PAT → error on onboarding page; no row written to `integration_tokens`
- [x] 2.6 Returning user with Jira token visiting `/onboarding` redirects to `/dashboard`
- [x] 2.7 PAT and site URL never appear in browser network response bodies or server logs

### Phase 3: Legacy Auth Removal & Documentation

#### Automated

- [ ] 3.1 Linting passes: `npm run lint`
- [ ] 3.2 Build passes: `npm run build`
- [ ] 3.3 No remaining imports/references to deleted signin/signup routes (grep verification)

#### Manual

- [ ] 3.4 Landing page shows single sign-in CTA; no signup link
- [ ] 3.5 `/auth/signup` returns 404
- [ ] 3.6 Full flow still works: Google sign-in → onboarding → dashboard → sign out
- [ ] 3.7 README and AGENTS.md accurately describe Google + Jira onboarding setup
