# Dashboard as Default Route — Implementation Plan

## Overview

Make the sprint dashboard the app's root route (`/`) and delete the current static marketing home page. `/dashboard` is retired entirely — its content moves into `index.astro`. Auth-gate logic, sign-out/account-delete/onboarding redirect targets, tests, and docs all shift from `/dashboard` to `/`.

## Current State Analysis

- `src/pages/index.astro` renders `Welcome.astro` — static "10x Astro Starter" marketing boilerplate (cosmic hero, feature cards, one CTA to `/auth/signin`). No dynamic content, no other page references it.
- `src/pages/dashboard.astro` is the real product entry point: renders `AppNav` + the `SprintPicker` React island under a "Sprint capacity" heading.
- `src/middleware.ts:6` — `PROTECTED_ROUTES = ["/dashboard", "/onboarding", "/settings"]`, matched via `pathname.startsWith(route)` (`middleware.ts:9`). Unauthenticated users hitting protected routes bounce to `/auth/signin`; authenticated users without a Jira token are bounced from `/dashboard` to `/onboarding` and vice versa (`middleware.ts:37-43`).
- `Welcome.astro` is the sole consumer of `Topbar.astro`; `Topbar.astro` is not used anywhere else (dashboard uses `AppNav` directly).
- Three redirect call sites currently target `/dashboard` or `/`:
  - `src/pages/api/auth/signout.ts:11` → `/`
  - `src/pages/api/account/delete.ts:60` → `/`
  - `src/pages/api/onboarding/jira.ts:46` → `/dashboard`
- Tests hardcode `/dashboard`: `src/middleware.auth-gates.test.ts`, `src/pages/api/redirect-routes-secret-scan.test.ts:88`, `tests/auth.setup.ts`, `tests/e2e/sprint-picker-cascade.spec.ts`, `tests/e2e/seed.spec.ts`.
- `README.md` documents a route table listing `/dashboard` and `/onboarding` behavior.

### Key Discoveries:

- `isProtectedPage` uses `pathname.startsWith(route)` (`middleware.ts:9`) — swapping in `"/"` naively would match **every** path, since every pathname starts with `/`. This needs an exact-match special case for the root route.
- No other code references `index.astro`, `dashboard.astro`, `Welcome.astro`, or `Topbar.astro` by name outside what's listed above (verified via repo-wide grep).

## Desired End State

- Visiting `/` renders the sprint dashboard (board/sprint picker), gated by the same auth rules `/dashboard` had.
- `/dashboard` no longer exists as a route (no redirect kept — per decision, it's removed outright).
- Sign-out and account deletion land on `/auth/signin`. Successful Jira onboarding lands on `/`.
- `Welcome.astro`, `Topbar.astro`, and the old `dashboard.astro` are deleted; no dead imports remain.
- All auth-gate tests, secret-scan tests, and e2e tests pass against the new root-based routing.

## What We're NOT Doing

- Not keeping `/dashboard` as a redirect alias — old bookmarks to `/dashboard` will 404 (explicit decision).
- Not changing `Layout.astro`'s default title prop mechanism — new `index.astro` passes `title="Dashboard"` explicitly, same as old `dashboard.astro` did.
- Not touching `context/foundation/*.md` snapshot docs (test-plan.md, infrastructure.md) — those are point-in-time artifacts, not live documentation.
- Not changing the onboarding flow's own redirect targets (`/onboarding?error=...`) beyond the final success redirect.

## Implementation Approach

Work root-outward: fix the auth guard first (Phase 1), then the page/component structure (Phase 2), then the remaining redirect call sites (Phase 3), then tests and docs (Phase 4). This order means each phase leaves the app in a runnable, testable state — middleware changes alone are inert until Phase 2 makes `/` protected content, and Phase 3/4 just chase down remaining string references.

## Phase 1: Middleware Root Guard

### Overview

Update the auth-gate middleware so `/` is the protected dashboard route instead of `/dashboard`, with correct exact-match handling for root.

### Changes Required:

#### 1. `src/middleware.ts`

**Intent**: Replace `/dashboard` with `/` in the protected-route list and the two Jira-token redirect branches; fix the matcher so `/` doesn't accidentally match every path.

**Contract**: `PROTECTED_ROUTES` becomes `["/", "/onboarding", "/settings"]`. `isProtectedPage` must exact-match the root entry and prefix-match the rest:

```ts
function isProtectedPage(pathname: string): boolean {
  return PROTECTED_ROUTES.some((route) => (route === "/" ? pathname === "/" : pathname.startsWith(route)));
}
```

The two redirect branches change from `pathname.startsWith("/dashboard")` → `pathname === "/"`, and the onboarding-complete redirect target changes from `/dashboard` → `/`.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] N/A — covered by Phase 4's automated test updates (no standalone manual check needed here since `/` isn't a real page yet until Phase 2)

---

## Phase 2: Merge Dashboard Into Home Route

### Overview

Move the real dashboard content to `index.astro`, delete the old dashboard route and the now-dead marketing components.

### Changes Required:

#### 1. `src/pages/index.astro`

**Intent**: Replace the Welcome-page content with the dashboard content that currently lives in `dashboard.astro` (same imports: `AppNav`, `Layout`, `SprintPicker`).

**Contract**: `index.astro` becomes a copy of current `dashboard.astro`'s template (`Layout title="Dashboard"` wrapping `AppNav` + the "Sprint capacity" heading + `<SprintPicker client:load />`).

#### 2. `src/pages/dashboard.astro`

**Intent**: Delete — its content now lives at `index.astro`.

**Contract**: File removed.

#### 3. `src/components/Welcome.astro`

**Intent**: Delete — dead marketing boilerplate, no longer referenced by any page.

**Contract**: File removed.

#### 4. `src/components/Topbar.astro`

**Intent**: Delete — its only consumer was `Welcome.astro`.

**Contract**: File removed.

#### 5. `src/components/AppNav.astro`

**Intent**: Update the "Dashboard" nav link to point at the new root path.

**Contract**: `href="/dashboard"` → `href="/"` (line 10). Link label text unchanged.

### Success Criteria:

#### Automated Verification:

- [ ] Build succeeds: `npm run build`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] `npm run dev`, visit `/` while signed in with a Jira token → sprint dashboard renders (board/sprint picker, "Sprint capacity" heading)
- [ ] Visit `/` while signed out → redirected to `/auth/signin`
- [ ] Visit `/` while signed in without a Jira token → redirected to `/onboarding`
- [ ] Visit `/dashboard` → 404 (route no longer exists)
- [ ] `AppNav`'s "Dashboard" link on `/settings` or `/onboarding` navigates back to `/`

---

## Phase 3: Redirect Target Updates

### Overview

Point the remaining auth-flow redirects at the new routes.

### Changes Required:

#### 1. `src/pages/api/auth/signout.ts`

**Intent**: Send signed-out users to the sign-in page instead of the now-repurposed root.

**Contract**: `context.redirect("/")` (line 11) → `context.redirect("/auth/signin")`.

#### 2. `src/pages/api/account/delete.ts`

**Intent**: Send users whose account was just deleted to the sign-in page instead of root.

**Contract**: `context.redirect("/")` (line 60, success path) → `context.redirect("/auth/signin")`.

#### 3. `src/pages/api/onboarding/jira.ts`

**Intent**: Send users who just completed Jira onboarding to the new dashboard-at-root route.

**Contract**: `context.redirect("/dashboard")` (line 46) → `context.redirect("/")`.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] Sign out from `/settings` → lands on `/auth/signin`
- [ ] Delete account from `/settings` → lands on `/auth/signin`
- [ ] Complete Jira PAT onboarding form → lands on `/` showing the dashboard

---

## Phase 4: Test and Docs Updates

### Overview

Update every test that hardcodes `/dashboard` to reflect the new root-based routing, and correct the README's route table.

### Changes Required:

#### 1. `src/middleware.auth-gates.test.ts`

**Intent**: Retarget all `/dashboard` URLs and redirect assertions to `/`; update test descriptions to match.

**Contract**: Every `url: "http://localhost/dashboard"` → `url: "http://localhost/"`; the "authenticated user with Jira token from /onboarding to /dashboard" case's `assertRedirect(response, "/dashboard")` → `assertRedirect(response, "/")`. Test titles referencing `/dashboard` reworded to `/`.

#### 2. `src/pages/api/redirect-routes-secret-scan.test.ts`

**Intent**: Fix the onboarding-jira redirect assertion to match the new target.

**Contract**: Line 88 `expect(location).toContain("/dashboard")` → `expect(location).toBe("/")` (exact match — `toContain("/")` would trivially pass for any path and no longer proves anything).

#### 3. `src/pages/api/auth/callback.auth-gates.test.ts`

**Intent**: The assertion at line 109 (`not.toContain("/dashboard")`) is now vacuously true since the route no longer exists anywhere in the codebase — leave as-is, no change needed (out of scope; not a hardcoded dependency on behavior this plan touches).

**Contract**: No change.

#### 4. `tests/auth.setup.ts`

**Intent**: Point Playwright's auth setup at the root route instead of `/dashboard`.

**Contract**: `page.goto("/dashboard")` (line 6) → `page.goto("/")`; `page.waitForURL("**/dashboard", ...)` (line 17) → `page.waitForURL("**/", ...)`.

#### 5. `tests/e2e/sprint-picker-cascade.spec.ts`

**Intent**: Navigate to root instead of `/dashboard`.

**Contract**: `page.goto("/dashboard")` (line 33) → `page.goto("/")`.

#### 6. `tests/e2e/seed.spec.ts`

**Intent**: Navigate to root instead of `/dashboard`.

**Contract**: `page.goto("/dashboard")` (line 19) → `page.goto("/")`.

#### 7. `README.md`

**Intent**: Update the route table so `/` documents the dashboard and `/dashboard` is no longer listed; fix the onboarding row's redirect-target reference and the "User journey" walkthrough step.

**Contract**: Route table row `/dashboard` → merged into `/` (sprint picker description); `/onboarding` row's "redirects to `/dashboard` if done" → "redirects to `/` if done"; "Open `/dashboard`" step in the user journey section → "Open `/`".

### Success Criteria:

#### Automated Verification:

- [ ] Full unit/integration suite passes: `npm run test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] E2E suite passes (if run locally with Playwright configured): `npx playwright test`

#### Manual Verification:

- [ ] README route table read-through confirms no remaining `/dashboard` references
- [ ] Full manual auth-flow walkthrough (sign in → dashboard at `/` → sign out → sign back in → settings → delete account) has no dead links or broken redirects

---

## Testing Strategy

### Unit Tests:

- `middleware.auth-gates.test.ts` redirect matrix fully re-targeted to `/`
- `redirect-routes-secret-scan.test.ts` exact-match assertion on the onboarding success redirect

### Integration Tests:

- Existing Vitest suite for API routes (`signout.ts`, `account/delete.ts`, `onboarding/jira.ts`) — no new tests needed since these are simple redirect-target swaps within already-tested handlers; existing assertions cover the surrounding logic and only the destination string needs updating in Phase 4.

### Manual Testing Steps:

1. Sign out, confirm landing on `/auth/signin`.
2. Sign in without a Jira token, confirm bounce to `/onboarding`, complete onboarding, confirm landing on `/` with dashboard visible.
3. Visit `/dashboard` directly, confirm 404.
4. Delete account from `/settings`, confirm landing on `/auth/signin`.

## Performance Considerations

None — this is a routing/content relocation with no new data flows or components.

## Migration Notes

No data migration. Any external links or bookmarks to `/dashboard` will break (explicit decision — no redirect alias kept).

## References

- Prior dashboard implementation: `src/pages/dashboard.astro` (deleted in Phase 2)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Middleware Root Guard

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — 4ed49f4
- [x] 1.2 Linting passes: `npm run lint` — 4ed49f4

### Phase 2: Merge Dashboard Into Home Route

#### Automated

- [x] 2.1 Build succeeds: `npm run build` — da060e9
- [x] 2.2 Type checking passes: `npm run typecheck` — da060e9
- [x] 2.3 Linting passes: `npm run lint` — da060e9

#### Manual

- [x] 2.4 Visit `/` signed in with Jira token → dashboard renders — da060e9
- [x] 2.5 Visit `/` signed out → redirected to `/auth/signin` — da060e9
- [x] 2.6 Visit `/` signed in without Jira token → redirected to `/onboarding` — da060e9
- [x] 2.7 Visit `/dashboard` → 404 — da060e9
- [x] 2.8 AppNav "Dashboard" link navigates to `/` — da060e9

### Phase 3: Redirect Target Updates

#### Automated

- [x] 3.1 Type checking passes: `npm run typecheck` — 4ed7cd9
- [x] 3.2 Linting passes: `npm run lint` — 4ed7cd9

#### Manual

- [x] 3.3 Sign out from `/settings` → lands on `/auth/signin` — 4ed7cd9
- [x] 3.4 Delete account from `/settings` → lands on `/auth/signin` — 4ed7cd9
- [x] 3.5 Complete Jira onboarding → lands on `/` showing dashboard — 4ed7cd9

### Phase 4: Test and Docs Updates

#### Automated

- [x] 4.1 Full unit/integration suite passes: `npm run test` — f1bf115
- [x] 4.2 Type checking passes: `npm run typecheck` — f1bf115
- [x] 4.3 Linting passes: `npm run lint` — f1bf115
- [x] 4.4 E2E suite passes: `npx playwright test` — f1bf115

#### Manual

- [x] 4.5 README route table read-through, no remaining `/dashboard` references — f1bf115
- [x] 4.6 Full manual auth-flow walkthrough with no dead links — f1bf115
