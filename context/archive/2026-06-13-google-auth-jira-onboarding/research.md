---
date: 2026-06-13T12:00:00+02:00
researcher: Cursor Agent (Auto)
git_commit: 96f15b37bf38762a2a09bc07c86b035ae98942de
branch: master
repository: sprint-capacity-intelligence
topic: "How to implement Google OAuth provider in Supabase for S-01 (google-auth-jira-onboarding)"
tags: [research, codebase, supabase, google-oauth, auth, s-01, astro-ssr, cloudflare]
status: complete
last_updated: 2026-06-13
last_updated_by: Cursor Agent (Auto)
---

# Research: How to implement Google OAuth provider in Supabase for S-01

**Date**: 2026-06-13T12:00:00+02:00
**Researcher**: Cursor Agent (Auto)
**Git Commit**: 96f15b37bf38762a2a09bc07c86b035ae98942de
**Branch**: master
**Repository**: sprint-capacity-intelligence

## Research Question

How to implement Google OAuth provider in Supabase for S-01 from `context/foundation/roadmap.md` — enabling EM sign-in with Google (FR-001) as the first step of the `google-auth-jira-onboarding` slice.

## Summary

S-01 requires **net-new Google OAuth work** on top of an existing email/password Supabase SSR scaffold. The implementation is a standard Supabase PKCE OAuth flow adapted to Astro API routes on Cloudflare Workers:

1. **Configure Google Cloud Console** — create a Web OAuth client; authorized redirect URIs point to **Supabase** (`https://<project-ref>.supabase.co/auth/v1/callback`), not the Astro app.
2. **Configure Supabase** (hosted dashboard + local `config.toml`) — enable Google provider with client ID/secret; add app callback URLs to the Redirect URLs allow list.
3. **Add two Astro API routes** — `GET /api/auth/google` calls `signInWithOAuth` and redirects to Google via Supabase; `GET /api/auth/callback` calls `exchangeCodeForSession(code)` to set session cookies via the existing `createClient` adapter.
4. **Update sign-in UI** — add "Continue with Google" linking to `/api/auth/google`; de-emphasize or remove email/password in production per PRD.
5. **Fix local config mismatch** — `supabase/config.toml` uses port `3000` but Astro dev runs on `4321`; align before testing OAuth locally.

**Important distinction:** Supabase Google sign-in (S-01) creates a Supabase session in `auth.users`. Google Calendar token storage (S-03) is a **separate OAuth pass** with Calendar scopes, stored encrypted in `integration_tokens` via `IntegrationTokenService`. Do not conflate the two flows.

No new Astro env vars are needed for Google login — client ID/secret live in Supabase configuration. Existing `SUPABASE_URL` and `SUPABASE_KEY` suffice.

## Detailed Findings

### S-01 scope and requirements

From the roadmap and PRD:

- **Outcome:** User can sign in with Google and configure Jira PAT during onboarding (`context/foundation/roadmap.md:67-69`).
- **FR-001:** EM can sign in with Google — must-have (`context/foundation/prd.md:68-70`).
- **FR-002:** EM configures Jira PAT during onboarding — must-have, separate from OAuth provider setup (`context/foundation/prd.md:72-73`).
- **Prerequisite F-01:** `IntegrationTokenService.upsertJiraPat()` is ready; S-01 wires an authenticated API route against it (`context/changes/integration-token-store/plan.md:21,145-152`).
- **Unknown (user-owned, not blocking):** Google OAuth provider configuration in Supabase (`context/foundation/roadmap.md:76`).

### Current auth baseline (gaps vs Google OAuth)

| Component       | Current state                                                           | Gap for S-01                                                |
| --------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| SSR client      | `createServerClient` with cookie adapter in `src/lib/supabase.ts`       | Reuse as-is                                                 |
| Middleware      | `getUser()` → `context.locals.user`; protects `/dashboard` only         | Callback route must stay unprotected (already fine)         |
| Sign-in         | Email/password form → `POST /api/auth/signin` with `signInWithPassword` | No Google button, no OAuth start route                      |
| Callback        | None                                                                    | Need `GET /api/auth/callback` with `exchangeCodeForSession` |
| Supabase config | Email auth enabled; no `[auth.external.google]`                         | Add Google provider section                                 |
| Redirect URLs   | `site_url = http://127.0.0.1:3000`                                      | Wrong port; missing production Workers URL                  |
| Env schema      | `SUPABASE_URL`, `SUPABASE_KEY` only                                     | No app-level Google secrets needed                          |

### OAuth redirect chain (two hops)

Google never redirects directly to the Astro app. The flow is:

```
User → App (/api/auth/google)
     → Supabase signInWithOAuth → Google consent
     → Supabase /auth/v1/callback
     → App /api/auth/callback?code=...
     → exchangeCodeForSession → session cookies → redirect to /dashboard or onboarding
```

Per Supabase PKCE/SSR docs, the server must exchange the `code` query parameter for a session — implicit/hash-token flows do not work with `@supabase/ssr`.

### 1. Google Cloud Console setup

**APIs & Services → Credentials → Create OAuth client ID → Web application**

| Setting                       | Values                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Authorized JavaScript origins | `http://127.0.0.1:4321`, `http://localhost:4321`, `https://sprint-capacity-intelligence.marcelina-kucieba.workers.dev`    |
| Authorized redirect URIs      | `http://127.0.0.1:54321/auth/v1/callback` (local Supabase), `https://<project-ref>.supabase.co/auth/v1/callback` (hosted) |

**Scopes for sign-in (S-01):** `openid`, `userinfo.email`, `userinfo.profile` (Supabase defaults).

**Do not** add `/api/auth/callback` to Google redirect URIs — that URL belongs in Supabase's allow list only.

For S-03 (Calendar), enable Google Calendar API and add `calendar.readonly` scope to the same or a separate OAuth client — out of S-01 scope but plan the client accordingly.

### 2. Supabase Dashboard (hosted project)

**Authentication → Providers → Google**

- Enable Google
- Paste Client ID and Client Secret from Google Cloud
- Note the Supabase callback URL shown on this page for Google Cloud configuration

**Authentication → URL Configuration**

| Setting       | Recommended value                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Site URL      | `https://sprint-capacity-intelligence.marcelina-kucieba.workers.dev`                                                            |
| Redirect URLs | `http://127.0.0.1:4321/**`, `http://localhost:4321/**`, `https://sprint-capacity-intelligence.marcelina-kucieba.workers.dev/**` |

Exact callback paths to allow (used in `redirectTo`):

```
http://127.0.0.1:4321/api/auth/callback
https://sprint-capacity-intelligence.marcelina-kucieba.workers.dev/api/auth/callback
```

### 3. Local dev: `supabase/config.toml`

Current auth block uses port 3000 (`supabase/config.toml:154-156`) but Astro dev defaults to 4321. Update:

```toml
[auth]
site_url = "http://127.0.0.1:4321"
additional_redirect_urls = [
  "http://127.0.0.1:4321/**",
  "http://localhost:4321/**",
  "https://sprint-capacity-intelligence.marcelina-kucieba.workers.dev/**",
]

[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
redirect_uri = "http://127.0.0.1:54321/auth/v1/callback"
skip_nonce_check = true  # often needed for local Google; official default is false
```

Add to root `.env` (read by `supabase start`):

```env
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=<secret>
```

Restart Supabase after config changes: `supabase stop && supabase start`.

The comment at `supabase/config.toml:315-316` confirms `skip_nonce_check` is specifically for local Google sign-in.

### 4. Application code (Astro SSR + Cloudflare)

#### 4a. OAuth start route — `src/pages/api/auth/google.ts`

```typescript
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signin?error=not-configured");
  }

  const origin = new URL(context.request.url).origin;
  const next = context.url.searchParams.get("next") ?? "/dashboard";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(error?.message ?? "oauth-failed")}`);
  }
  return context.redirect(data.url);
};
```

Follows the same pattern as existing `src/pages/api/auth/signin.ts` (form POST + redirect) but uses `GET` and `signInWithOAuth`.

#### 4b. OAuth callback route — `src/pages/api/auth/callback.ts`

```typescript
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const code = context.url.searchParams.get("code");
  let next = context.url.searchParams.get("next") ?? "/dashboard";
  if (!next.startsWith("/")) next = "/dashboard";

  if (!code) {
    return context.redirect("/auth/signin?error=missing-code");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signin?error=not-configured");
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect(next);
};
```

Matches Supabase's documented PKCE callback pattern (see `oauth_pkce_flow.mdx` partial): read `code`, call `exchangeCodeForSession`, redirect on success.

#### 4c. Sign-in UI update

Add to `src/pages/auth/signin.astro` or `src/components/auth/SignInForm.tsx`:

- Primary CTA: link/button to `GET /api/auth/google`
- Optionally hide email/password form in production (PRD commits to Google-only sign-in)

#### 4d. Middleware — no changes required

`src/middleware.ts` already resolves `context.locals.user` via `getUser()` and only protects `/dashboard`. The callback route is not in `PROTECTED_ROUTES`.

Consider post-S-01 enhancement: redirect authenticated users away from `/auth/signin`.

#### 4e. Cloudflare Workers considerations

- Export `const prerender = false` on new API routes (per `AGENTS.md`).
- Reuse existing `createClient` — auth sessions are Supabase cookies, not the `SESSION` KV binding in `wrangler.jsonc`.
- Production secrets: existing `SUPABASE_URL` / `SUPABASE_KEY` in Wrangler; no Google secrets at the Worker layer.
- Preview deploy URLs need their own Supabase Redirect URL entries if testing OAuth on branches.

### 5. Sign-in OAuth (S-01) vs Calendar tokens (S-03)

| Aspect      | S-01: Supabase Auth sign-in               | S-03: Google Calendar integration                  |
| ----------- | ----------------------------------------- | -------------------------------------------------- |
| Purpose     | Create Supabase user + session            | Call Google Calendar API                           |
| Storage     | Supabase session cookies (JWT)            | `integration_tokens` via `IntegrationTokenService` |
| OAuth entry | `signInWithOAuth({ provider: "google" })` | Second OAuth pass for signed-in user               |
| Scopes      | openid, email, profile                    | `calendar.readonly`                                |
| Callback    | `/api/auth/callback`                      | e.g. `/api/integrations/google-calendar/callback`  |
| Refresh     | Supabase handles session refresh          | App refreshes via `oauth2.googleapis.com/token`    |

For S-01, **do not** pass `access_type: offline` or Calendar scopes in `signInWithOAuth` — those belong in the S-03 calendar connect flow where `provider_refresh_token` is captured and encrypted.

Types in `src/types.ts` (`GoogleCalendarTokenPayload`) are for S-03 integration tokens, not Supabase login.

### 6. Email/password: keep or remove?

| Environment       | Recommendation                                                            |
| ----------------- | ------------------------------------------------------------------------- |
| Production        | Google-only per PRD FR-001; hide signup/password UI                       |
| Local dev         | Optional: keep email/password routes for smoke tests without Google setup |
| F-01 verification | `integration-token-store` plan uses email/password test users locally     |

First production deploy explicitly deferred Google OAuth (`context/changes/deployment/deploy-plan.md:38,154`); S-01 is when Google becomes the product sign-in path.

### 7. Post-login onboarding (FR-002 — out of OAuth scope)

After Google sign-in succeeds, S-01 still needs:

- Onboarding page/flow for Jira PAT entry
- Authenticated API route calling `IntegrationTokenService.upsertJiraPat(context.locals.user.id, { pat, siteUrl })`
- Redirect guard: unauthenticated users → sign-in; authenticated without Jira token → onboarding

Error mapping for token service calls deferred from F-01 to S-01 API routes (`context/changes/integration-token-store/reviews/impl-review.md:64-75`).

## Code References

- `src/lib/supabase.ts:1-24` — SSR cookie client factory; reuse for OAuth routes
- `src/middleware.ts:1-25` — `getUser()` session resolution; `/dashboard` protection
- `src/pages/api/auth/signin.ts:1-20` — existing auth API pattern (POST + redirect)
- `src/components/auth/SignInForm.tsx:43` — email/password form action; add Google CTA alongside
- `src/env.d.ts:1-5` — `locals.user` typed as Supabase `User | null`
- `astro.config.mjs:17-22` — env schema; no Google secrets needed at app level
- `supabase/config.toml:150-156` — auth site_url/redirect_urls (needs port fix + Google section)
- `supabase/config.toml:302-318` — external provider template (apple example; add google block)
- `wrangler.jsonc:1-21` — Cloudflare adapter; SESSION KV unused for Supabase auth
- `src/lib/services/integration-token-service.ts:96-104` — `upsertJiraPat()` for FR-002 wiring
- `src/types.ts:1-6` — `JiraTokenPayload` shape for onboarding API

## Architecture Insights

- **Convention alignment:** New auth routes should mirror existing API route style (`src/pages/api/auth/*.ts`), export `prerender = false`, use `createClient(context.request.headers, context.cookies)`.
- **Single SSR client pattern:** No browser-side Supabase client exists today; OAuth must start and complete server-side — consistent with Cloudflare Workers SSR.
- **Two-hop OAuth is by design:** Google → Supabase → App. Misconfiguring Google redirect URIs to point at the Astro app is the most common setup error.
- **PKCE is default in `@supabase/ssr`:** Callback route with `exchangeCodeForSession` is mandatory; do not attempt client-side hash parsing.
- **Identity vs integration tokens:** Supabase Auth session proves who the user is; `integration_tokens` stores third-party API credentials — separate concerns, separate OAuth flows.

## Historical Context (from prior changes)

- `context/foundation/roadmap.md:46,76-77` — Baseline is email/password only; Google OAuth is net-new critical-path work; Supabase provider config is user-owned unknown.
- `context/foundation/prd.md:68-70,110` — FR-001 mandates Google sign-in; rationale is downstream Calendar OAuth dependency.
- `context/changes/integration-token-store/plan.md:32-33` — F-01 explicitly excluded Google OAuth sign-in; deferred to S-01.
- `context/changes/integration-token-store/plan.md:21,145-152` — S-01 expected to call `upsertJiraPat()` from authenticated API route using session client.
- `context/changes/deployment/deploy-plan.md:38,154` — First deploy used email-only; Google OAuth deferred until S-01.
- `context/changes/integration-token-store/reviews/impl-review.md:64-75` — HTTP error mapping for token service deferred to S-01 routes.

No `context/archive/**` entries contain prior Google OAuth decisions.

## Related Research

- `context/changes/integration-token-store/plan.md` — F-01 foundation S-01 builds on
- `context/foundation/roadmap.md` — S-01 slice definition and dependency chain

## Open Questions

1. **Onboarding route structure** — Single `/onboarding` page vs multi-step wizard for Jira PAT? Not specified in PRD; decide during `/10x-plan`.
2. **Post-login redirect target** — `/dashboard` vs `/onboarding` when Jira PAT not yet configured? Needs product decision in planning.
3. **Email/password removal timing** — Remove entirely or gate behind dev-only flag? PRD says Google-only for production; local dev convenience TBD.
4. **Supabase project ref** — User must substitute `<project-ref>` in Google Cloud and Supabase dashboard URLs during setup (user-owned step per roadmap unknowns).
5. **Account linking** — If a user previously signed up with email/password and later uses Google with same email, Supabase linking behavior should be verified during implementation.

## Implementation Checklist (for `/10x-plan`)

### User setup (Supabase + Google Cloud)

- [ ] Create Google Cloud Web OAuth client
- [ ] Add Supabase callback URIs to Google authorized redirect URIs
- [ ] Enable Google provider in Supabase Dashboard with client ID/secret
- [ ] Add app callback URLs to Supabase Redirect URLs allow list
- [ ] Add `[auth.external.google]` to `supabase/config.toml` for local dev
- [ ] Fix `site_url` port from 3000 → 4321 in `config.toml`
- [ ] Add `SUPABASE_AUTH_EXTERNAL_GOOGLE_*` env vars for `supabase start`

### Application code (S-01)

- [ ] `src/pages/api/auth/google.ts` — OAuth start
- [ ] `src/pages/api/auth/callback.ts` — code exchange
- [ ] Update sign-in UI with Google CTA
- [ ] Onboarding page + Jira PAT API route (FR-002)
- [ ] Post-auth redirect logic (dashboard vs onboarding)
- [ ] Map token service errors in API routes

### Verification

- [ ] Local: Google sign-in → session cookies → `/dashboard` or onboarding
- [ ] Production: same flow on Workers domain
- [ ] Jira PAT save via `IntegrationTokenService.upsertJiraPat()`
- [ ] `npm run lint && npm run build`

## Common Failure Modes

| Symptom                             | Likely cause                                | Fix                                                     |
| ----------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| `redirect_uri_mismatch` from Google | App URL in Google redirect URIs             | Use Supabase `/auth/v1/callback` only                   |
| Supabase "redirect URL not allowed" | Missing app callback in allow list          | Add exact `/api/auth/callback` URL                      |
| `exchangeCodeForSession` fails      | Callback not using SSR cookie client        | Use existing `createClient` adapter                     |
| Local nonce errors                  | Google + local Supabase nonce mismatch      | `skip_nonce_check = true`; restart Supabase             |
| Works locally, fails on Workers     | Missing production redirect URLs or secrets | Add Workers domain to Supabase; verify Wrangler secrets |
| Port mismatch on local OAuth        | `site_url` at :3000, Astro at :4321         | Align `config.toml` and `redirectTo` origins            |
