# Dashboard as Default Route — Plan Brief

> Full plan: `context/changes/home-page/plan.md`

## What & Why

The current home page (`/`) is static "10x Astro Starter" marketing boilerplate left over from the template — no real function, one CTA to sign-in. The sprint dashboard (`/dashboard`) is the actual product. This change makes the dashboard the default route at `/` and deletes the dead home page entirely.

## Starting Point

`src/pages/index.astro` renders `Welcome.astro` (static hero + feature cards). `src/pages/dashboard.astro` renders the real `SprintPicker` island behind an auth + Jira-token gate in `src/middleware.ts` (`PROTECTED_ROUTES = ["/dashboard", "/onboarding", "/settings"]`). Sign-out and account-delete redirect to `/`; onboarding-success redirects to `/dashboard`.

## Desired End State

Visiting `/` — signed in with a Jira token — shows the sprint dashboard directly. `/dashboard` no longer exists (404). Sign-out and account-delete land on `/auth/signin`. The old marketing page, `Welcome.astro`, and `Topbar.astro` (its only consumer) are gone.

## Key Decisions Made

| Decision                           | Choice                                                                          | Why (1 sentence)                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Root route behavior                | Render dashboard content directly at `/` (no redirect)                          | Cleanest URL, dashboard truly becomes the default route with zero extra hop         |
| Old `/dashboard` path              | Removed entirely, no alias                                                      | User confirmed home page "should be deleted"; no need to preserve a duplicate route |
| Route guard                        | Replace `/dashboard` with `/` in `PROTECTED_ROUTES`, using exact-match for root | `startsWith` would match every path if used naively for `/` — needs special-casing  |
| Sign-out / account-delete redirect | `/auth/signin` (was `/`)                                                        | `/` no longer hosts a meaningful landing page for a logged-out user                 |
| Welcome.astro / Topbar.astro       | Deleted                                                                         | Dead code once index.astro's content changes; Topbar has no other consumer          |

## Scope

**In scope:**

- Middleware guard logic for root route
- Merging dashboard content into `index.astro`, deleting `dashboard.astro`, `Welcome.astro`, `Topbar.astro`
- Redirect target updates: signout, account-delete, onboarding-success
- Test updates (unit + e2e) and README route table

**Out of scope:**

- Keeping `/dashboard` as a redirect alias
- Changing `Layout.astro`'s default title mechanism
- Editing `context/foundation/*.md` snapshot docs

## Architecture / Approach

Root-outward: fix the middleware guard first (inert until routes change), then move page content and delete dead components, then chase remaining redirect strings, then tests/docs. Each phase leaves the app runnable.

## Phases at a Glance

| Phase                              | What it delivers                                               | Key risk                                                                |
| ---------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1. Middleware Root Guard           | `/` becomes the protected route with correct exact-match logic | Naive `startsWith("/")` would match every path — must special-case      |
| 2. Merge Dashboard Into Home Route | `/` renders the dashboard; dead components deleted             | Missing a stray import of `Welcome`/`Topbar`/`dashboard.astro`          |
| 3. Redirect Target Updates         | Signout/delete/onboarding all point at correct destinations    | Easy to miss one of the three call sites                                |
| 4. Test and Docs Updates           | All hardcoded `/dashboard` references updated                  | `toContain("/")` assertions would trivially pass — must use exact match |

**Prerequisites:** None — self-contained within this repo, no external dependencies.
**Estimated effort:** ~1 session, 4 small phases.

## Open Risks & Assumptions

- Assumes no external users have bookmarked `/dashboard` in a way that matters (internal tool, low bookmark risk).
- `callback.auth-gates.test.ts:109`'s stale `/dashboard` assertion is left untouched — it becomes vacuously true but isn't a functional risk.

## Success Criteria (Summary)

- `/` shows the sprint dashboard for authenticated users with a Jira token, and routes correctly for signed-out / no-token users.
- `/dashboard` 404s.
- Sign-out, account-delete, and onboarding-success all land on the correct new destinations.
- Full test suite (unit + e2e) passes with no remaining `/dashboard` references in code or README.
