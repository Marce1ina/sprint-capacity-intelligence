---
title: Anti-Corruption Layer — Supabase Boundary Isolation
created: 2026-07-11
type: refactor-plan
---

# Anti-Corruption Layer — Supabase Boundary Isolation

> Product of this document is a **refactor PLAN**, not code. No production code was modified.
> The leaking dependency, its value objects, and its ports were **discovered and chosen**, not
> assumed. Every claim is cited by `path:line`, verified during this pass.
> Flow: discovery → identification → classification → diagnosis → design → proof → plan.

---

## Step 0 — Discovered context

### Base documents

| Document            | Path                                       | Relevant signal                                                                                                                                                                       |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tech stack          | `context/foundation/tech-stack.md`         | "Astro + Supabase + Cloudflare" starter; auth requirement satisfied "via Supabase" (`tech-stack.md:29`).                                                                              |
| Infrastructure      | `context/foundation/infrastructure.md`     | Supabase treated as an **external, swappable** dependency: "external Supabase (Q5)", "edge Supabase patterns" as a portability risk (`infrastructure.md:17`, `infrastructure.md:50`). |
| PRD                 | `context/foundation/prd.md`                | Auth = "Google OAuth login" (`prd.md:110`); tokens "stored securely; not exposed in UI or logs" (`prd.md:46`).                                                                        |
| Domain distillation | `context/domain/01-domain-distillation.md` | `IntegrationToken` invariant: one token per `(user, provider)`, encrypted at rest, never returned to UI (`01-domain-distillation.md:103`).                                            |

There is **no explicit "Supabase must be replaceable" clause**, but the infrastructure doc repeatedly
frames Supabase as an external, potentially-migrated component (adapter swaps, "edge Supabase
patterns" as a fallback risk — `infrastructure.md:50`). The intent is portability at the platform
edge; the code, as shown below, hard-wires Supabase into the domain and auth layers.

### Stack, dependencies, layers

- **Stack:** Astro 6 SSR + React 19 islands, Tailwind 4, Cloudflare Workers (`tech-stack.md:5-8`).
- **External runtime dependencies (from `package.json:19-41`):** `@supabase/ssr` (`package.json:26`),
  `@supabase/supabase-js` (`package.json:27`), plus UI-only libs (`lucide-react`, `radix-ui`,
  `class-variance-authority`, `clsx`, `tailwind-merge`).
- **Layers observed in `src/`:**
  - Middleware: `src/middleware.ts`.
  - API routes: `src/pages/api/**`.
  - Domain/service layer: `src/lib/services/**`.
  - Shared helpers + auth context: `src/lib/**`.
  - Shared DTO/entity types: `src/types.ts`, global ambient types `src/env.d.ts`.
  - UI (islands + hooks): `src/components/**`.
  - Persistence: `supabase/migrations/20260605120000_integration_tokens.sql`.

---

## Step 1 — Identify leaking dependencies

### Candidate A — Supabase (`@supabase/supabase-js` + `@supabase/ssr`)

Two facets of one vendor: **identity/auth** and **persistence (PostgREST)**. The vendor's concrete
types (`SupabaseClient`, `User`) and its SDK call surface (`supabase.auth.*`, `supabase.from(...)`)
appear across middleware, six API routes, the auth context helper, and the token domain service.

**Every file that "knows" Supabase today (production):**

| #   | File `path:line`                                                      | What leaks                                                                             |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | `src/lib/supabase.ts:1,9`                                             | `@supabase/ssr` `createServerClient` factory (SSR cookie client).                      |
| 2   | `src/lib/supabase-admin.ts:1,4,9`                                     | `@supabase/supabase-js` `createClient` + `SupabaseClient` return type (service role).  |
| 3   | `src/env.d.ts:3`                                                      | Supabase `User` type IS `App.Locals.user` — app-wide global.                           |
| 4   | `src/middleware.ts:3,14,19,34`                                        | `createClient`; `supabase.auth.getUser()`; raw client passed into domain service.      |
| 5   | `src/lib/jira-api-context.ts:3,5,10,29,40`                            | `User` type in the `JiraApiContext` contract; `createClient`; raw client into service. |
| 6   | `src/lib/services/integration-token-service.ts:1,9,27,78,121,132,141` | `SupabaseClient` in domain constructor; hand-written PostgREST queries.                |
| 7   | `src/pages/api/auth/google.ts:3,8,15`                                 | `createClient`; `supabase.auth.signInWithOAuth`.                                       |
| 8   | `src/pages/api/auth/callback.ts:3,14,19`                              | `createClient`; `supabase.auth.exchangeCodeForSession`.                                |
| 9   | `src/pages/api/auth/signout.ts:2,7,9`                                 | `createClient`; `supabase.auth.signOut`.                                               |
| 10  | `src/pages/api/account/delete.ts:6,7,24,47,53`                        | `createAdminClient`; `createClient`; `adminClient.auth.admin.deleteUser`; `signOut`.   |
| 11  | `src/pages/api/onboarding/jira.ts:3,34,40`                            | `createClient`; raw client into domain service.                                        |

**Test files that also bind to Supabase types/SDK** (allowed to know the adapter, listed for completeness):
`src/test/mock-api-context.ts:3`, `src/test/jira-route-mocks.ts:1`, `src/test/rls-fixtures.ts:1,56,70,77`,
`src/test/mock-supabase-client.ts:7`, `src/middleware.auth-gates.test.ts:12`,
`src/pages/api/auth/callback.auth-gates.test.ts:16`, `src/pages/api/redirect-routes-secret-scan.test.ts:23`.

### Candidate B — Jira integration (ruled out)

Not an external-library leak. Jira is consumed via raw `fetch` + Basic auth (`btoa`), not an SDK
(`src/lib/services/jira-client.ts:19-22`), and is already funnelled through one module
(`jira-client.ts`) + one context helper (`jira-api-context.ts`). No Jira npm package to leak.

### Candidate C — UI libs (`lucide-react`, `radix-ui`, `clsx`, …) (ruled out)

Single-layer (UI only) — confined to `src/components/**` and `src/lib/utils.ts`. No cross-boundary
leak; no domain/wire-contract contamination.

---

## Step 2 — Classify and pick #1

| Axis                                   | A · Supabase                                                                                     | B · Jira                   | C · UI libs |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------- | ----------- |
| (a) Layers / files touched             | **7 production files across 4 layers** (middleware, API, service, ambient types) + 7 tests       | 1 layer (already isolated) | 1 layer     |
| (b) Cost/risk of swapping today        | **Very high** — types are woven into `App.Locals` and a domain constructor                       | Low (fetch)                | Low         |
| (c) Docs declare it should be portable | **Yes (weak-to-medium)** — external Supabase, adapter/edge-swap risk (`infrastructure.md:17,50`) | n/a                        | n/a         |

**Chosen worst leak: #1 = Supabase.** Justification:

1. It is the only dependency whose **concrete library types appear in domain signatures and shared
   contracts** — a textbook DDD violation: `SupabaseClient` in the `IntegrationTokenService`
   constructor (`integration-token-service.ts:9`) and Supabase `User` in `JiraApiContext.user`
   (`jira-api-context.ts:10`) and in the app-wide `App.Locals.user` (`env.d.ts:3`).
2. The **same SDK surface is duplicated** across the client factory + six routes + middleware
   (`supabase.auth.*` in five files, `supabase.from(...)` in one service).
3. It is the only candidate the base docs frame as an **externally swappable platform component**,
   yet the code makes that swap a whole-app refactor — a real intent-vs-code gap.

The two Supabase facets (identity, persistence) share one npm vendor, so a single ACL package with
**two narrow ports** cleanly captures the whole leak.

---

## Step 3 — Diagnosis

### 3a. Library types inside domain signatures / shared contracts (the core violation)

```1:11:src/lib/services/integration-token-service.ts
import type { SupabaseClient } from "@supabase/supabase-js";
// ...
export class IntegrationTokenService {
  constructor(
    private supabase: SupabaseClient,
    private encryptionKey: string,
  ) {}
```

A domain service that owns the `IntegrationToken` invariant (encryption at rest, one-per-provider)
depends **directly** on a vendor client type and hand-writes PostgREST query builders
(`.from("integration_tokens").upsert(...)` at `integration-token-service.ts:27`; `.select().eq().eq().maybeSingle()`
at `:77-82`; `.delete().eq()` at `:120-124`, `:132`; `.select().eq().eq().maybeSingle()` at `:140-145`).
Persistence dialect leaks into the domain.

The Supabase `User` type leaks into a domain-facing contract and the global ambient type:

```9:14:src/lib/jira-api-context.ts
export interface JiraApiContext {
  user: User;
  pat: string;
  siteUrl: string;
  email: string;
}
```

```1:5:src/env.d.ts
declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
  }
}
```

Because `App.Locals.user` is the vendor `User`, **every** consumer of `context.locals.user`
(`middleware.ts:20`, `jira-api-context.ts:24`, `onboarding/jira.ts:12`, `account/delete.ts:12`)
transitively depends on Supabase's type shape.

### 3b. Duplicated SDK reconstruction across the client/server boundary and across routes

The raw client is re-created and its `auth` surface re-invoked in every route rather than behind one
port:

- `supabase.auth.getUser()` — `middleware.ts:19`
- `supabase.auth.signInWithOAuth(...)` — `api/auth/google.ts:15`
- `supabase.auth.exchangeCodeForSession(code)` — `api/auth/callback.ts:19`
- `supabase.auth.signOut()` — `api/auth/signout.ts:9`, `api/account/delete.ts:53`
- `adminClient.auth.admin.deleteUser(...)` — `api/account/delete.ts:47`

Each of `google.ts:8`, `callback.ts:14`, `signout.ts:7`, `account/delete.ts:24`, `onboarding/jira.ts:34`,
`jira-api-context.ts:29`, `middleware.ts:14` calls `createClient(context.request.headers, context.cookies)`
and then reaches into `.auth` / passes the raw client into `new IntegrationTokenService(...)`
(`middleware.ts:34`, `jira-api-context.ts:40`, `onboarding/jira.ts:40`, `account/delete.ts:30`).

### 3c. Partial, inconsistent isolation already present (proves the pattern is wanted)

- `src/lib/supabase.ts:5` centralises the SSR client factory — good, but leaks the raw client to callers.
- `src/lib/auth-errors.ts:1-4` already defines a **structural** `AuthErrorLike` instead of importing
  Supabase's `AuthError`, and `callback.ts:19-21` feeds a Supabase error into it. This is a working
  mini-ACL to imitate and generalise.

### 3d. Correctness/security gap surfaced by the vendor contract

Per current `@supabase/ssr` docs, `setAll` receives a second `headers` argument carrying
anti-caching headers (`Cache-Control: private, no-cache, no-store, ...`) that **must** be written to
responses that set auth cookies, "otherwise one user's session token can be served to a different
user" (source: `@supabase/ssr` `SetAllCookies` type docs). The current adapter ignores it:

```17:22:src/lib/supabase.ts
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
```

This is exactly the kind of vendor-contract decision that belongs **inside the ACL adapter**, not
scattered — see Step 5c.

---

## Step 4 — ACL design

Goal: the domain and application layers know only **ports** (domain interfaces) and **domain value
objects**. Exactly one package — `src/lib/acl/supabase/` — imports `@supabase/*`.

### 4a. Domain value object — `AuthenticatedUser`

The single place that knows how a Supabase `User` maps to the domain identity. Lives in
`src/types.ts` (project convention: shared DTO/entity types in `src/types.ts`).

```typescript
// src/types.ts
export interface AuthenticatedUser {
  readonly id: string; // provider-agnostic stable user id
  readonly email: string | null;
}
```

`App.Locals.user` becomes `AuthenticatedUser | null` (no vendor import in `env.d.ts`).

### 4b. Domain-facing token model (unchanged, already vendor-free)

`JiraTokenPayload` / `GoogleCalendarTokenPayload` / `IntegrationProvider` in `src/types.ts` are
already vendor-neutral. The ACL keeps the domain speaking these; only **encrypted strings** cross the
repository port, never PostgREST builders.

### 4c. Narrow ports (domain interfaces)

```typescript
// src/lib/ports/auth-gateway.ts
export interface OAuthStart {
  url: string;
}
export type AuthResult = { ok: true } | { ok: false; code?: string; message?: string };

export interface AuthGateway {
  getCurrentUser(): Promise<AuthenticatedUser | null>;
  startGoogleSignIn(redirectTo: string): Promise<OAuthStart | AuthResult>;
  completeSignIn(code: string): Promise<AuthResult>;
  signOut(): Promise<void>;
}

// src/lib/ports/account-admin-gateway.ts
export interface AccountAdminGateway {
  deleteUser(userId: string): Promise<void>;
}

// src/lib/ports/token-repository.ts  (persistence port — encrypted strings only)
export interface TokenRepository {
  upsertEncrypted(userId: string, provider: IntegrationProvider, encryptedPayload: string): Promise<void>;
  findEncrypted(userId: string, provider: IntegrationProvider): Promise<string | null>;
  delete(userId: string, provider: IntegrationProvider): Promise<void>;
  deleteAll(userId: string): Promise<void>;
  exists(userId: string, provider: IntegrationProvider): Promise<boolean>;
}
```

### 4d. Adapters (the only files importing Supabase)

```
src/lib/acl/supabase/
  supabase-client.ts            # moved from src/lib/supabase.ts (SSR factory) — internal
  supabase-admin-client.ts      # moved from src/lib/supabase-admin.ts — internal
  supabase-auth-gateway.ts      # implements AuthGateway; maps User -> AuthenticatedUser
  supabase-account-admin.ts     # implements AccountAdminGateway
  supabase-token-repository.ts  # implements TokenRepository via PostgREST
  index.ts                      # factory: build gateways/repo from an APIContext
```

Adapter pseudocode (mapping + vendor-contract knowledge live here only):

```typescript
// supabase-auth-gateway.ts
export class SupabaseAuthGateway implements AuthGateway {
  constructor(private supabase: SupabaseClient) {}
  async getCurrentUser() {
    const {
      data: { user },
    } = await this.supabase.auth.getUser(); // getUser() = verified server-side
    return user ? { id: user.id, email: user.email ?? null } : null; // <- ONLY mapping site
  }
  async startGoogleSignIn(redirectTo: string) {
    const { data, error } = await this.supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    return data?.url ? { url: data.url } : { ok: false, code: error?.code, message: error?.message };
  }
  async completeSignIn(code: string) {
    const { error } = await this.supabase.auth.exchangeCodeForSession(code);
    return error ? { ok: false, code: error.code, message: error.message } : { ok: true };
  }
  async signOut() {
    await this.supabase.auth.signOut();
  }
}

// supabase-token-repository.ts  — the ONLY place PostgREST dialect lives
export class SupabaseTokenRepository implements TokenRepository {
  constructor(private supabase: SupabaseClient) {}
  async upsertEncrypted(userId, provider, encryptedPayload) {
    const { error } = await this.supabase
      .from("integration_tokens")
      .upsert({ user_id: userId, provider, encrypted_payload: encryptedPayload }, { onConflict: "user_id,provider" });
    if (error) throw new TokenStoreError(error.message); // vendor error -> domain error
  }
  async findEncrypted(userId, provider) {
    const { data, error } = await this.supabase
      .from("integration_tokens")
      .select("encrypted_payload")
      .eq("user_id", userId)
      .eq("provider", provider)
      .maybeSingle();
    if (error) throw new TokenStoreError(error.message);
    return typeof data?.encrypted_payload === "string" ? data.encrypted_payload : null;
  }
  // delete / deleteAll / exists: same pattern
}
```

`IntegrationTokenService` keeps ALL domain logic (encryption via `token-encryption.ts`, payload
assertions, one-per-provider intent) but depends on the **port**, not the client:

```typescript
// integration-token-service.ts (after)
export class IntegrationTokenService {
  constructor(
    private repo: TokenRepository,
    private encryptionKey: string,
  ) {}
  async getJiraPat(userId: string): Promise<JiraTokenPayload | null> {
    const encrypted = await this.repo.findEncrypted(userId, "jira");
    if (encrypted === null) return null;
    return this.assertJiraPayload(await decryptTokenPayload(encrypted, this.requireEncryptionKey()));
  }
  // upsert/delete/hasToken delegate persistence to this.repo; encryption stays here
}
```

---

## Step 5 — Isolation proof + before/after

### 5a. Swap proof — replacing Supabase touches only the adapter

A migration to another auth/DB provider (e.g. the documented `@astrojs/node` + alternative backend
fallback, `infrastructure.md:50`) would edit **only** `src/lib/acl/supabase/**` and add a sibling
adapter package. Untouched:

- **Persistence schema/table** — `supabase/migrations/20260605120000_integration_tokens.sql` (the
  repository port speaks `(userId, provider, encryptedPayload)`, not table columns, to the domain).
- **API routes** — `google.ts`, `callback.ts`, `signout.ts`, `onboarding/jira.ts`, `account/delete.ts`
  call ports (`authGateway.*`, `tokenService.*`), no `supabase.*`.
- **Middleware** — `middleware.ts` calls `authGateway.getCurrentUser()` and the token service.
- **Domain service** — `integration-token-service.ts` (imports the port, zero Supabase).
- **Shared types** — `src/types.ts` / `src/env.d.ts` expose `AuthenticatedUser`, no vendor import.
- **UI** — already Supabase-free.

### 5b. Before / after for the duplicated sites

| Site                             | Before                                                         | After                                                  |
| -------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| `middleware.ts:14,19`            | `createClient(...)`, `supabase.auth.getUser()`                 | `authGateway.getCurrentUser()`                         |
| `api/auth/google.ts:8,15`        | `createClient`, `supabase.auth.signInWithOAuth`                | `authGateway.startGoogleSignIn(redirectTo)`            |
| `api/auth/callback.ts:14,19`     | `createClient`, `supabase.auth.exchangeCodeForSession`         | `authGateway.completeSignIn(code)`                     |
| `api/auth/signout.ts:7,9`        | `createClient`, `supabase.auth.signOut`                        | `authGateway.signOut()`                                |
| `account/delete.ts:24,47,53`     | `createClient`, `adminClient.auth.admin.deleteUser`, `signOut` | `accountAdmin.deleteUser(id)`, `authGateway.signOut()` |
| `integration-token-service.ts:9` | ctor takes `SupabaseClient`, hand-writes PostgREST             | ctor takes `TokenRepository`; persistence in adapter   |
| `jira-api-context.ts:10`         | `user: User` (Supabase)                                        | `user: AuthenticatedUser`                              |
| `env.d.ts:3`                     | `import("@supabase/supabase-js").User`                         | `AuthenticatedUser` (from `@/types`)                   |

The UI never received a raw Supabase object (islands read domain DTOs via JSON already, e.g.
`SprintPicker`), so the "UI gets ready domain data" property holds before and is preserved after.

### 5c. Contract-driven decisions, encoded in the ACL (not in API routes)

- **Auth verification:** keep `supabase.auth.getUser()` (verified server-side identity) rather than
  `getSession()`; encode in `SupabaseAuthGateway.getCurrentUser()`.
- **Cookie security:** honor the `@supabase/ssr` `setAll(cookiesToSet, headers)` contract and write
  the anti-caching headers the library supplies (prevents cross-user session bleed); encode in
  `supabase-client.ts` `setAll` — fixing the current omission at `src/lib/supabase.ts:17`.
- **Query semantics:** `onConflict: "user_id,provider"` and `.maybeSingle()` stay inside
  `SupabaseTokenRepository`; the domain never sees PostgREST options.
- **Error translation:** Supabase `AuthError`/PostgREST errors are mapped to domain errors
  (`AuthResult`, `TokenStoreError`) in adapters; generalise the existing `AuthErrorLike`
  (`auth-errors.ts:1-4`) as the domain-facing shape.

---

## Step 6 — Verification and phased plan

### Success criterion (mechanical)

```bash
rg -n "@supabase/(ssr|supabase-js)" src/            # production hits: ONLY src/lib/acl/supabase/**
rg -n "supabase\.(auth|from)\(|SupabaseClient|import\(\"@supabase" src/  # same
```

**Files that know Supabase today → after refactor:**

| File                                            | Today | After                                         |
| ----------------------------------------------- | ----- | --------------------------------------------- |
| `src/lib/supabase.ts`                           | yes   | moved into ACL                                |
| `src/lib/supabase-admin.ts`                     | yes   | moved into ACL                                |
| `src/env.d.ts`                                  | yes   | **no**                                        |
| `src/middleware.ts`                             | yes   | **no**                                        |
| `src/lib/jira-api-context.ts`                   | yes   | **no**                                        |
| `src/lib/services/integration-token-service.ts` | yes   | **no**                                        |
| `src/pages/api/auth/google.ts`                  | yes   | **no**                                        |
| `src/pages/api/auth/callback.ts`                | yes   | **no**                                        |
| `src/pages/api/auth/signout.ts`                 | yes   | **no**                                        |
| `src/pages/api/account/delete.ts`               | yes   | **no**                                        |
| `src/pages/api/onboarding/jira.ts`              | yes   | **no**                                        |
| `src/lib/acl/supabase/**` (new)                 | —     | **yes (only)**                                |
| tests (`src/test/**`, `*.test.ts`)              | yes   | mock ports; may know adapter in adapter tests |

### Phased plan (aligned to project conventions)

Track under `context/changes/supabase-acl/` (`change.md` + `plan.md`, per `context/changes/README.md`).
Each phase ends green on `npm run typecheck`, `npm run lint`, `npm run test`.

1. **Phase 1 — Ports + value object (no behavior change).** Add `AuthenticatedUser` to `src/types.ts`;
   add `src/lib/ports/*.ts`. No consumers switched yet.
2. **Phase 2 — Persistence adapter.** Add `src/lib/acl/supabase/supabase-token-repository.ts`;
   change `IntegrationTokenService` ctor to `TokenRepository`; update its 4 call sites
   (`middleware.ts:34`, `jira-api-context.ts:40`, `onboarding/jira.ts:40`, `account/delete.ts:30`) to
   build the repo from the ACL factory. Update `src/test/mock-integration-token-service.ts` to the port.
3. **Phase 3 — Auth + admin gateways.** Add auth/admin adapters; route `middleware.ts`,
   `google.ts`, `callback.ts`, `signout.ts`, `account/delete.ts` through `AuthGateway` /
   `AccountAdminGateway`. Fold the `setAll` header fix into `supabase-client.ts`.
4. **Phase 4 — De-leak types.** Switch `env.d.ts` and `jira-api-context.ts` to `AuthenticatedUser`;
   move `supabase.ts` + `supabase-admin.ts` into `src/lib/acl/supabase/`; update test helpers
   (`mock-api-context.ts`, `jira-route-mocks.ts`) to the domain VO.
5. **Phase 5 — Verify + lock.** Run the Step 6 grep; confirm only `src/lib/acl/supabase/**` matches.
   Consider an ESLint `no-restricted-imports` rule banning `@supabase/*` outside `src/lib/acl/**` to
   prevent regression.

---

## Constraints honored

- No production code written; every `path:line` was verified in this pass.
- Jira and UI libraries were evaluated and explicitly ruled out with evidence.
- Contract decisions were resolved against current `@supabase/ssr` docs and pinned to the adapter.
- Output written to `context/domain/03-anti-corruption-layer.md`.

---

## Summary

The worst leaking dependency is **Supabase** (`@supabase/ssr` + `@supabase/supabase-js`), whose
concrete types and SDK surface cross four layers: the vendor `User` type is the app-wide
`App.Locals.user` (`env.d.ts:3`) and part of the `JiraApiContext` contract (`jira-api-context.ts:10`),
while `SupabaseClient` is injected straight into the domain `IntegrationTokenService` constructor,
which hand-writes PostgREST queries (`integration-token-service.ts:9,27`). The same `createClient` +
`supabase.auth.*` reconstruction is duplicated across middleware and five routes, and the base
infrastructure doc frames Supabase as externally swappable (`infrastructure.md:17,50`) — an
intent-vs-code gap the current wiring makes expensive to honor. The proposed ACL introduces an
`AuthenticatedUser` value object plus three narrow ports (`AuthGateway`, `AccountAdminGateway`,
`TokenRepository`) with Supabase adapters confined to `src/lib/acl/supabase/`, keeping encryption and
invariants in the domain while pushing persistence dialect, error translation, and the
`getUser()`/cookie-header contract into the adapter. After the five-phase refactor, replacing Supabase
touches only the adapter package — not the migration schema, API routes, middleware, domain service,
shared types, or UI — provable by a `rg "@supabase"` that returns only `src/lib/acl/supabase/**`. A
byproduct fix: the adapter will honor the `@supabase/ssr` `setAll(headers)` contract that the current
`supabase.ts:17` ignores, closing a potential cross-user session-cache risk.
