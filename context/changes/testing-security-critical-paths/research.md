---
date: 2026-07-04T12:58:00+02:00
researcher: Auto (Cursor agent)
git_commit: 6bf40cb2056d7d9b79296678c1acb5abce2a7ca2
branch: master
repository: 10x-sprint-load
topic: "Phase 1 rollout — Risks #2, #3, #5 (token leakage, auth gates, IDOR)"
tags: [research, codebase, security, vitest, auth, integration-tokens, middleware, jira-api-context]
status: complete
last_updated: 2026-07-04
last_updated_by: Auto (Cursor agent)
---

# Research: Phase 1 Rollout — Risks #2, #3, #5

**Date**: 2026-07-04T12:58:00+02:00  
**Researcher**: Auto (Cursor agent)  
**Git Commit**: `6bf40cb2056d7d9b79296678c1acb5abce2a7ca2`  
**Branch**: master  
**Repository**: 10x-sprint-load

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` for Risks #2, #3, and #5: locate real failure paths in code, verify or correct Risk Response Guidance, identify existing tests, recommend cheapest useful test layers, and flag speculative risks or misleading hot-spot evidence.

## Summary

**No application tests exist today** (`package.json` has no `test` script; CI runs lint + build only). The codebase is currently **well-designed against all three risks**, but protection is **convention-based and regression-prone** — there is nothing in CI to catch a future `details: error` field or admin-client misuse.

| Risk                      | Ground truth                                                                                                                                                     | Test-plan guidance                                                                   | Corrections                                                                                                                                                                                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#2** Token leakage      | No plaintext PAT/OAuth in JSON, redirects, or logs today. Single `{ error: string }` contract via `jsonError`.                                                   | **Verified correct.** Recursive JSON scan + route smoke; challenge `details` fields. | Hot-spot `src/lib/services/` alone is **insufficient** — `src/lib/jira-api-context.ts` is the critical JSON surface. Calendar OAuth routes **do not exist yet** (future regression vector).                                                                                                           |
| **#3** Auth/session gates | Two-layer auth: middleware gates 3 page routes; API routes auth in handlers. OAuth callback writes cookies, always redirects to `/onboarding`.                   | **Mostly correct.** Integration redirect contract is right layer.                    | Refine "valid session → dashboard" → requires **Jira token** (or middleware sends to `/onboarding`). Middleware-only tests **miss** callback cookie writes and stale-session client 401 UX. Hot-spot `src/pages/api/auth/` (7 touches/30d) is **misleading** — one-time Google OAuth migration churn. |
| **#5** Cross-user IDOR    | RLS `auth.uid() = user_id` on `integration_tokens` is the real isolation boundary. Routes always pass `context.locals.user.id`. No sprint-analysis tables exist. | **Verified correct** for tokens. Two-user fixture against real DB; don't over-mock.  | Split scope: **token IDOR testable now**; **sprint-analysis IDOR is speculative** until S-04. Extend fixture beyond cross-read to cross-write/delete. Jira `sprintId` manipulation is **not app cross-user IDOR** (uses caller's PAT).                                                                |

**Cheapest Phase 1 stack**: Vitest via Astro `getViteConfig()` → unit tests on error/response helpers → integration tests importing middleware/API handlers with mock `APIContext` → optional local-Supabase two-user RLS suite (promote `scripts/verify-integration-tokens.mts` pattern).

## Detailed Findings

### Risk #2 — Token leakage in API responses, browser payloads, or logs

#### Current protection (verified in code)

All Jira JSON routes share one error builder — flat string only, no nested `details`:

```16:21:src/lib/jira-api-context.ts
export function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
```

PAT is decrypted server-side and passed to Jira HTTP only — never serialized:

```38:66:src/lib/jira-api-context.ts
  let jiraToken;
  try {
    const service = new IntegrationTokenService(supabase, TOKEN_ENCRYPTION_KEY);
    jiraToken = await service.getJiraPat(user.id);
  } catch {
    return jsonError(503, "Could not load Jira credentials. Please try again later.");
  }
  // ...
    return {
      user,
      pat: jiraToken.pat,
      siteUrl,
      email,
    };
```

Jira upstream failures map to fixed user messages; response bodies are discarded (`src/lib/services/jira-client.ts` — `JiraValidationError` on 401/!ok).

Non-JSON routes (onboarding, account delete, auth) use **redirect-only** responses with fixed or whitelisted error strings — no JSON exfil surface.

Logging at token-adjacent paths logs **only `error.message`**, never token values:

```44:47:src/middleware.ts
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      // eslint-disable-next-line no-console -- fail-open guard; log PostgREST errors without token data
      console.error("Jira token check failed:", message);
```

All app `console.*` in `src/`: `middleware.ts`, `account/delete.ts`, `google-revoke.ts` — five call sites, none log token material.

#### Token-touching route inventory

| Route                                  | Token touch                            | Client-visible output          |
| -------------------------------------- | -------------------------------------- | ------------------------------ |
| `POST /api/onboarding/jira`            | Ingest PAT → encrypt                   | `302` redirect                 |
| `GET /api/jira/boards`                 | Decrypt PAT → Jira                     | `{ boards }` JSON              |
| `GET /api/jira/boards/[id]/sprints`    | Decrypt PAT → Jira                     | `{ sprints }` JSON             |
| `GET /api/jira/sprints/[id]/assignees` | Decrypt PAT → Jira                     | `{ assignees, sprintId }` JSON |
| `POST /api/account/delete`             | Decrypt Google refresh → revoke        | `302` redirect                 |
| Middleware                             | `hasToken("jira")` — selects `id` only | N/A                            |

**Calendar OAuth connect routes do not exist.** `IntegrationTokenService.upsertGoogleCalendarTokens()` / `getGoogleCalendarTokens()` are implemented but only consumed by account deletion today — highest **future** leakage surface when S-03/S-04 ships.

#### Real failure paths (regression vectors)

1. Adding `{ error, details: error }` or spreading exception objects into JSON responses.
2. Changing `mapJiraClientError` to `String(error)` or forwarding Jira response bodies.
3. Logging `resolved`, `jiraToken`, or `googleTokens` in catch blocks.
4. New calendar OAuth callback returning token fields in JSON or redirect query params.
5. Returning `encrypted_payload` or full `IntegrationTokenRow` from any route.

#### Response guidance verification

| Guidance item                                                    | Verdict                                                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Prove no API/error/client payload contains plaintext credentials | **Correct** — scan all JSON routes + redirect `Location` query params                   |
| Challenge redacted errors leaking in `details`                   | **Correct** — no `details` today; assert absence or recursive scan includes nested keys |
| Avoid top-level key-only assertions                              | **Correct** — use recursive substring scan with injected probe token                    |
| Cheapest layer: unit + integration route smoke                   | **Correct**                                                                             |
| Anti-pattern: logging spy that never runs in CI                  | **Correct** — force failures in token-load paths during tests                           |

#### Hot-spot evidence assessment

§2 cites `src/lib/services/` (9 touches/30d) as likelihood evidence for Risk #6, not #2. For #2, services hold encrypt/decrypt and Jira error sanitization, but **`src/lib/jira-api-context.ts` + `src/pages/api/jira/*` + onboarding/account-delete** are the exfil surfaces. Services alone miss the JSON contract.

---

### Risk #3 — OAuth login and session handling

#### Architecture: two layers

**Layer 1 — Middleware** (`src/middleware.ts`): resolves `context.locals.user` via `supabase.auth.getUser()` on every request; redirects unauthenticated users from three page prefixes:

```6:29:src/middleware.ts
const PROTECTED_ROUTES = ["/dashboard", "/onboarding", "/settings"];
// ...
  if (!context.locals.user) {
    if (isProtectedPage(pathname)) {
      return context.redirect("/auth/signin");
    }
    return next();
  }
```

**Layer 2 — Jira onboarding gate** (authenticated only, `/settings` excluded):

```32:43:src/middleware.ts
  if (isProtectedPage(pathname) && supabase && !pathname.startsWith("/settings")) {
    try {
      const service = new IntegrationTokenService(supabase, TOKEN_ENCRYPTION_KEY ?? "");
      const hasJiraToken = await service.hasToken(context.locals.user.id, "jira");

      if (pathname.startsWith("/dashboard") && !hasJiraToken) {
        return context.redirect("/onboarding");
      }

      if (pathname.startsWith("/onboarding") && hasJiraToken) {
        return context.redirect("/dashboard");
      }
```

**Layer 3 — API route auth** (not middleware-gated): `resolveJiraApiContext` returns `401` JSON; form routes redirect to sign-in.

#### OAuth flow (not middleware-protected)

```19:24:src/pages/api/auth/callback.ts
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(authErrorUserMessage(error))}`);
  }

  return context.redirect("/onboarding");
```

Success **always** lands on `/onboarding`, not `/dashboard`. Dashboard requires Jira onboarding completion.

Cookie writes happen in `createClient` → `setAll` during `exchangeCodeForSession` (`src/lib/supabase.ts`). No app-level session refresh logic — `@supabase/ssr` handles cookie rotation via `getUser()`.

#### Scenario matrix (code-backed)

| Request                            | Unauthenticated         | Auth, no Jira     | Auth + Jira      |
| ---------------------------------- | ----------------------- | ----------------- | ---------------- |
| `GET /dashboard`                   | `302 /auth/signin`      | `302 /onboarding` | `200`            |
| `GET /onboarding`                  | `302 /auth/signin`      | `200`             | `302 /dashboard` |
| `GET /settings`                    | `302 /auth/signin`      | `200`             | `200`            |
| `GET /api/jira/boards`             | `401` JSON              | `403` or `200`    | `200`            |
| `GET /api/auth/callback` (no code) | Handler → sign-in error | same              | same             |

#### Real failure paths

1. **Missing Supabase env** → `createClient` returns `null` → all users treated as unauthenticated.
2. **`hasToken()` throws** → middleware **fail-open** (logs, proceeds) — user may reach `/dashboard` without Jira token.
3. **Stale session on loaded dashboard** → SSR shell renders; client fetches get `401` and show error banner — **no redirect to sign-in** (`use-jira-sprint-picker.ts`).
4. **Sign-out with null supabase** → redirect `/` but cookies may remain.

#### Response guidance verification

| Guidance item                                              | Verdict                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| Unauthenticated → protected redirects sign-in              | **Correct** for pages; API routes return `401` JSON                |
| Valid session reaches dashboard                            | **Refine**: needs Jira token; OAuth alone → `/onboarding`          |
| Expired session does not silently proceed                  | **Partial**: page nav redirects; stale SPA shows error, not logout |
| Challenge middleware-once implies OAuth sound              | **Correct and critical** — callback/signout need separate cases    |
| Cheapest layer: integration redirect/status                | **Correct**                                                        |
| Anti-pattern: full browser e2e for every edge              | **Correct**                                                        |
| Anti-pattern: mocking Supabase away from redirect contract | **Correct** — assert HTTP contract; use fixtures surgically        |

#### Hot-spot evidence assessment

`src/pages/api/auth/` (7 file-touches/30d) reflects **one-time Google OAuth migration** (3 files, includes 2 deleted legacy routes) — **misleading as ongoing instability signal**. `src/middleware.ts` and `src/lib/supabase.ts` are equally load-bearing; interview/PRD evidence better supports Medium likelihood than directory churn.

---

### Risk #5 — Cross-user token and sprint data IDOR

#### Database isolation

Only custom table: `integration_tokens` with owner-only RLS:

```17:21:supabase/migrations/20260605120000_integration_tokens.sql
create policy "Users can manage their own integration tokens"
  on public.integration_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**No sprint-analysis or risk tables exist.** Sprint data is live Jira API output, not persisted.

#### Application ownership binding

Every token path uses session user ID — no client-supplied `userId`:

```23:27:src/lib/jira-api-context.ts
  const user = context.locals.user;
  if (!user) {
    return jsonError(401, "Authentication required.");
  }
```

```40:41:src/pages/api/onboarding/jira.ts
    await service.upsertJiraPat(user.id, { pat, siteUrl: assertAllowedJiraSiteUrl(siteUrl) });
```

`IntegrationTokenService` filters all queries by passed `userId` — **does not verify `userId === auth.uid()`** internally; RLS is the backstop when using session-scoped anon client.

#### Service role boundary

`createAdminClient()` used **only** in account delete for `auth.admin.deleteUser(user.id)` — never reads/writes `integration_tokens`:

```48:48:src/pages/api/account/delete.ts
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
```

Token purge uses session client: `tokenService.deleteAllTokens(user.id)`.

#### Jira route IDOR analysis

`boardId`/`sprintId` are Jira tenant identifiers — routes always load **caller's** PAT via `getJiraPat(user.id)`. User A passing User B's `sprintId` uses User A's credentials — **not app cross-user IDOR**. Shared Jira tenant visibility is Jira ACL, not app authorization.

#### Existing manual proof

`scripts/verify-integration-tokens.mts` includes two-user cross-read:

```144:147:scripts/verify-integration-tokens.mts
  const serviceB = new IntegrationTokenService(clientB, encryptionKey);
  const crossRead = await serviceB.getJiraPat(userAId);

  record("RLS blocks cross-user read", crossRead === null);
```

**Gap**: cross-write and cross-delete not covered in script.

#### Response guidance verification

| Guidance item                                        | Verdict                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| User A cannot fetch/decrypt/overwrite B's tokens     | **Correct** — test with two-user local Supabase                         |
| Challenge "requires login" = authorization           | **Correct** — Jira routes prove session+own-token, not sprint ownership |
| Ground RLS, route ownership, service-role boundaries | **Correct**                                                             |
| Cheapest layer: integration two-user fixture         | **Correct for tokens**                                                  |
| Anti-pattern: anonymous vs auth only                 | **Correct**                                                             |
| Anti-pattern: over-mocking DB                        | **Correct** — mocks bypass RLS, the real gate                           |

#### Speculative / deferred scope

- **Sprint analysis IDOR** — no DB table; defer until S-04.
- **EM reading assignee calendar tokens via service role** — planned in archive F-01/S-04, not implemented.
- **`IntegrationTokenService` + admin client** — would bypass RLS; static guard recommended.

---

## Code References

- `src/lib/jira-api-context.ts:16-21` — canonical JSON error shape (`{ error: string }` only)
- `src/lib/jira-api-context.ts:23-73` — auth + PAT resolution; PAT never in Response
- `src/lib/jira-api-context.ts:75-80` — Jira error mapping; generic fallback for unknown throws
- `src/lib/services/integration-token-service.ts:20-34` — encrypt before DB upsert
- `src/lib/services/integration-token-service.ts:103-117` — decrypt server-side only
- `src/lib/services/integration-token-service.ts:139-151` — `hasToken` selects `id` only
- `src/lib/services/jira-client.ts:118-134` — sanitized Jira HTTP errors
- `src/middleware.ts:6-52` — page auth gates + Jira onboarding redirects + fail-open catch
- `src/lib/supabase.ts:5-24` — SSR cookie bridge for all auth operations
- `src/pages/api/auth/callback.ts:7-24` — OAuth code exchange + cookie write + redirect
- `src/pages/api/onboarding/jira.ts:11-46` — PAT ingest bound to `user.id`
- `src/pages/api/account/delete.ts` — Google token read for revoke; admin delete scoped to `user.id`
- `supabase/migrations/20260605120000_integration_tokens.sql:17-21` — RLS owner policy
- `scripts/verify-integration-tokens.mts:144-147` — manual two-user RLS cross-read proof

## Architecture Insights

1. **Defense in depth for tokens**: RLS (primary) + route-level `user.id` binding (secondary) + never serializing decrypted payloads (tertiary).
2. **Single JSON error contract** — all Jira routes funnel through `jsonError`; easiest regression guard is unit tests on this function plus recursive response scanning.
3. **Auth is split**: middleware for pages, handlers for APIs, OAuth routes intentionally public — Phase 1 tests must cover both layers.
4. **Dashboard access is a three-hop**: OAuth → onboarding → Jira PAT save → dashboard; "authenticated" ≠ "can use dashboard."
5. **No test infrastructure** — greenfield Vitest setup; Astro `getViteConfig()` is the documented integration path (Context7 `/withastro/docs`, checked 2026-07-04).

## Historical Context (from prior changes)

- `context/archive/2026-06-05-integration-token-store/plan.md` — established encryption-at-rest, RLS, server-only token access; deferred service-role cross-user reads to S-04.
- `context/changes/testing-security-critical-paths/change.md` — Phase 1 scope and risk response intent aligned with findings.
- AGENTS.md — documents auth flow, protected routes, and "never return PAT or decrypted token payload" — matches code audit.

## Related Research

- None yet under `context/changes/**/research.md` for security testing.
- Phase 2 (`testing-jira-data-integrity`, TBD) will cover Risk #6 at Jira HTTP edge.

## Open Questions

1. **Vitest + Astro SSR handler imports**: confirm whether middleware/API routes import cleanly under `getViteConfig()` without Cloudflare runtime stubs — plan phase 1.1 should spike this.
2. **RLS tests in CI**: local Supabase required — gate as optional CI job or document as pre-merge manual until Phase 4?
3. **Stale-session UX**: is client-side 401 banner acceptable, or should Phase 1 include a redirect-on-401 enhancement (product decision, out of test scope unless requested)?

## Response-Guidance Corrections for Plan Author

Use these refined assertions when writing `plan.md`:

**Risk #2**

- Scan: all JSON bodies recursively + redirect `Location` query strings + forced-failure log output.
- Priority files: `jira-api-context.ts`, `api/jira/*`, `onboarding/jira.ts`, `account/delete.ts`.
- Defer calendar OAuth route tests until routes exist; add static "no calendar callback route" note.

**Risk #3**

- Minimum integration matrix: unauth page redirect, auth-no-jira dashboard→onboarding, settings-without-jira 200, callback missing-code redirect, API 401 JSON.
- Do **not** equate middleware pass with OAuth cookie write proof.
- Optional: fail-open `hasToken` throw case.

**Risk #5**

- Two-user local Supabase: cross-read, cross-upsert (expect RLS failure), cross-delete.
- Jira PAT binding: unit assert `getJiraPat(user.id)` in resolver; MSW Authorization header check deferred to Phase 2.
- Defer sprint-analysis IDOR until S-04 schema exists.
