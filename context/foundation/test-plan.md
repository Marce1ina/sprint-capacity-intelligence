# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-07-04

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/`.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                | Impact | Likelihood | Source (evidence — not anchor)                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | Assignee connects Google Calendar but their row never appears in the EM's sprint risk table                            | High   | High       | interview Q1; roadmap S-04 (north star); PRD US-01                                                                  |
| 2   | Jira PAT or calendar OAuth token appears in an API response, browser payload, or server log                            | High   | Medium     | interview Q1; PRD guardrails; archive F-01 plan                                                                     |
| 3   | Google OAuth login or session handling breaks; EM cannot reach dashboard or is logged out unexpectedly                 | High   | Medium     | interview Q1; PRD FR-001; auth spans middleware + OAuth routes (hot-spot dir metric inflated by one-time migration) |
| 4   | Risk bands (Low/Medium/High/Critical) misrepresent overload — EM commits to sprint scope based on a false "Low" signal | High   | Medium     | PRD business logic; roadmap S-04; PRD US-01 acceptance criteria                                                     |
| 5   | Authenticated user reads or mutates another user's integration tokens or sprint-scoped data                            | High   | Medium     | PRD access control; abuse lens (IDOR)                                                                               |
| 6   | Jira sprint assignee list or story-point totals are wrong (missing assignees, under-counted points)                    | High   | Medium     | hot-spot dir `src/lib/services/` (9 file-touches/30d); archive S-02 plan; PRD FR-003                                |
| 7   | Long-running sprint risk analysis exceeds two seconds without visible progress; EM assumes failure and abandons flow   | Medium | Medium     | PRD NFR (perceptible wait + progress); roadmap S-04 unknowns                                                        |

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                                                  | Must challenge                                                                                     | Context `/10x-research` must ground                                                                            | Likely cheapest layer                                        | Anti-pattern to avoid                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| #1   | Connected assignee with valid calendar token appears in risk table with non-empty metrics for the selected sprint                                                                                                            | "OAuth succeeded" implies row inclusion; partial-results policy silently drops valid users         | Calendar-connect persistence shape; assignee-to-user mapping; sprint window filter; table inclusion rules      | integration (mocked Google Calendar + DB)                    | Happy-path single-assignee e2e; asserting table length without verifying identity match                  |
| #2   | No API route, error body, or client-visible payload contains plaintext PAT, refresh token, or decrypted calendar credential                                                                                                  | Redacted error messages still leak secrets in `details` fields; redirect query params echo secrets | Central JSON error contract; every route response builder; error-translation path; logging near token reads    | unit (response-shape assertions) + integration (route smoke) | Asserting "no token key in JSON" while value lives under nested field; logging spy that never runs in CI |
| #3   | Unauthenticated page request redirects to sign-in; authenticated session with Jira token reaches dashboard (OAuth callback alone lands onboarding); expired session on page nav redirects to sign-in, not silent API success | Middleware redirect once implies OAuth callback cookie write and Jira onboarding gate are covered  | Middleware route list; OAuth callback cookie write; Jira onboarding redirect; protected vs public route matrix | integration (request → redirect/status)                      | Full browser e2e for every auth edge; mocking Supabase instead of asserting redirect contract            |
| #4   | Given fixed workload + meeting + context-switch inputs, risk band matches the documented qualitative mapping (not numeric precision)                                                                                         | Copying production threshold code into test expected value (oracle problem)                        | Risk algorithm inputs/outputs; band boundary fixtures from requirements; sprint window boundaries              | unit (pure function on fixtures)                             | Snapshot of entire table; testing UI color classes instead of band assignment                            |
| #5   | User A cannot fetch, decrypt, or overwrite User B's integration tokens (sprint-analysis IDOR when S-04 schema ships)                                                                                                         | "Requires login" equals authorization; Jira sprintId alone is not cross-user app IDOR              | RLS policies; route ownership checks; service-role usage boundaries                                            | integration (two-user fixture against real DB)               | Only testing anonymous vs authenticated; over-mocking DB so RLS never executes                           |
| #6   | Sprint assignee table matches known Jira issue set: every assignee listed, story points summed correctly, unassigned row when applicable                                                                                     | First page of Jira results represents full sprint                                                  | Jira pagination; custom story-point field resolution; empty/null assignee handling                             | integration (MSW or recorded fixtures at HTTP edge)          | Mocking internal aggregator so Jira contract drift is invisible                                          |
| #7   | Analysis taking >2s exposes continuous visible progress until results render                                                                                                                                                 | Spinner exists on mount therefore long jobs are covered                                            | Async job shape (if any); client polling/loading state triggers; timeout thresholds                            | integration or manual smoke                                  | Brittle `setTimeout` in test; e2e with real 3s Jira latency                                              |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                                      | Goal (one line)                                                      | Risks covered | Test types                 | Status       | Change folder                                    |
| --- | ----------------------------------------------- | -------------------------------------------------------------------- | ------------- | -------------------------- | ------------ | ------------------------------------------------ |
| 1   | Test runner bootstrap + security-critical paths | Bootstrap Vitest; prove tokens stay secret and auth gates hold       | #2, #3, #5    | unit + integration         | implementing | context/changes/testing-security-critical-paths/ |
| 2   | Jira data integrity                             | Catch assignee/point aggregation regressions at the HTTP edge        | #6            | integration (MSW/fixtures) | not started  | —                                                |
| 3   | North-star risk + calendar connect              | Prove connected assignees appear with correct qualitative risk bands | #1, #4, #7    | unit + integration         | not started  | —                                                |
| 4   | Quality-gates wiring                            | Run test suite in CI on every PR                                     | cross-cutting | CI gate                    | not started  | —                                                |

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section must be grounded in local manifests/configs
plus the MCP/tools actually exposed in the current session. If a useful docs
or search MCP such as Context7 or Exa.ai is not available, say that instead
of assuming access.

| Layer                | Tool        | Version | Notes                                                                                                                       |
| -------------------- | ----------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| unit + integration   | Vitest      | ^4.1.9  | `vitest.config.ts` via Astro `getViteConfig()`; `test.environment: "node"`; `src/**/*.test.ts`; see §6.1 |
| API mocking          | MSW         | TBD     | none yet — see §3 Phase 2; mock Jira/Google at HTTP edge only                                                               |
| e2e                  | Playwright  | n/a     | deferred — integration catches auth/token/Jira contracts cheaper; revisit only if cookie+SSR failures escape                |
| accessibility        | axe-core    | n/a     | excluded per §7 (interview Q5)                                                                                              |
| (optional) AI-native | browser MCP | n/a     | available in session — manual smoke only; not for CI                                                                        |

**Stack grounding tools (current session):**

- Docs: Context7 (`user-context7`) — available; Vitest/Astro test setup to be verified during Phase 1 research; checked: 2026-07-04
- Search: web search MCP — available for tool status discovery; Exa.ai not available in current session; checked: 2026-07-04
- Runtime/browser: cursor-ide-browser — available for manual north-star smoke; not a CI substitute; checked: 2026-07-04
- Provider/platform: GitHub Actions (lint+build today) — CI test gate lands in §3 Phase 4; Cloudflare/Supabase MCPs not exposed; checked: 2026-07-04

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                        | Where                | Required?                 | Catches                                       |
| --------------------------- | -------------------- | ------------------------- | --------------------------------------------- |
| lint + typecheck            | local + CI           | required                  | syntactic / type drift                        |
| unit + integration          | local + CI           | required after §3 Phase 1 | logic regressions, token leakage, auth gates  |
| e2e on critical flows       | CI on PR             | planned                   | deferred until integration gaps proven        |
| post-edit hook              | local (agent loop)   | planned                   | not justified under cost × signal yet         |
| visual diff (deterministic) | CI on PR             | excluded                  | see §7                                        |
| multimodal visual review    | CI on PR             | excluded                  | see §7                                        |
| pre-prod smoke              | between merge + prod | optional after §3 Phase 3 | north-star manual verification on live Worker |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

**Where tests live.** Colocate with the module under test: `src/lib/foo.test.ts` next to `src/lib/foo.ts`. Shared helpers only in `src/test/` (secret scanner, mock factories, fixtures).

**Run locally.**

```bash
npm run test              # full suite once
npm run test:watch        # watch mode
npm run test -- path/to/file.test.ts   # single file
```

**Vitest config.** `vitest.config.ts` uses Astro `getViteConfig()` with `test.environment: "node"` and `include: ["src/**/*.test.ts"]`. Path alias `@/` resolves the same as the app.

**Pure-function tests (Risk #2, #4).** Import the function directly; no HTTP or DB. Example targets: `jsonError`, `mapJiraClientError`, `authErrorUserMessage`, `encryptTokenPayload` / `decryptTokenPayload`.

```typescript
import { describe, expect, it } from "vitest";
import { jsonError } from "@/lib/jira-api-context";

describe("jsonError", () => {
  it("returns exactly { error: message }", async () => {
    const response = jsonError(401, "Authentication required.");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required." });
  });
});
```

**Secret-leak scans in unit tests.** Use `@/test/secret-scan` — never a top-level key denylist. Inject a unique probe string (`SECRET_PROBE` from `@/test/fixtures`) into errors or mock token payloads; assert it never appears in serialized output.

```typescript
import { SECRET_PROBE } from "@/test/fixtures";
import { assertNoSecretProbe } from "@/test/secret-scan";

assertNoSecretProbe(await response.json(), SECRET_PROBE);
```

- `assertNoSecretProbe(value, probe)` — throws with JSON paths where probe appears.
- `findSecretProbePaths(value, probe)` — returns paths without throwing (debugging).
- `assertResponseBodyHasNoSecretProbe(response, probe)` — parses Response body then scans (integration-friendly).

**Mocking session-bound services.** When a unit test touches code that calls `IntegrationTokenService`, mock the module once at file top:

```typescript
import { integrationTokenServiceMockModule, mockGetJiraPat } from "@/test/mock-integration-token-service";

vi.mock("@/lib/services/integration-token-service", () => integrationTokenServiceMockModule());
```

Configure return values per test with `mockGetJiraPat.mockResolvedValue(...)` in `beforeEach`.

**Static boundary checks.** For “must not import X” invariants (e.g. service-role client), add a small test that walks `src/` imports — see `src/lib/service-role-boundary.test.ts`.

### 6.2 Adding an integration test

Integration tests import Astro middleware or API route handlers and invoke them with a mock `APIContext` — no browser, no full server.

**Mock APIContext factory.** `@/test/mock-api-context`:

```typescript
import { createMockApiContext, createMockUser } from "@/test/mock-api-context";

const context = createMockApiContext({
  url: "http://localhost/dashboard",
  user: createMockUser({ id: "user-a" }),
  method: "GET",
});
```

- `context.locals.user` — set via `user` option (`null` = unauthenticated).
- `context.redirect` — Vitest spy; returns `302` Response (assert `Location` header).
- `context.cookies` — in-memory stub for cookie-dependent routes.

**Middleware handler import pattern.** Middleware resolves the user from Supabase on every request — mock `createClient` (not `locals.user` alone) before importing `onRequest`. Full file: `src/middleware.auth-gates.test.ts`.

```typescript
import { vi } from "vitest";
import type { APIContext } from "astro";
import { integrationTokenServiceMockModule, mockHasToken } from "@/test/mock-integration-token-service";
import { mockAstroEnvServer } from "@/test/mock-server-deps";
import { createMockApiContext } from "@/test/mock-api-context";

const mockGetUser = vi.fn();

vi.mock("astro:env/server", () => mockAstroEnvServer);
vi.mock("@/lib/supabase", () => ({
  createClient: (): { auth: { getUser: typeof mockGetUser } } => ({
    auth: { getUser: mockGetUser },
  }),
}));
vi.mock("@/lib/services/integration-token-service", () => integrationTokenServiceMockModule());

import { onRequest } from "@/middleware";

type MiddlewareFn = (context: APIContext, next: () => Response | Promise<Response>) => Response | Promise<Response>;
const middleware = onRequest as unknown as MiddlewareFn;

mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
const next = vi.fn(() => new Response("ok", { status: 200 }));
const response = await middleware(createMockApiContext({ url: "http://localhost/dashboard" }), next);

expect(response.status).toBe(302);
expect(response.headers.get("Location")).toContain("/auth/signin");
expect(next).not.toHaveBeenCalled();
```

Mock `@/lib/supabase` via **`createClient` → `auth.getUser`** and `@/lib/services/integration-token-service` (`hasToken`) so middleware never hits real DB.

**API route handler pattern.** Mock env + Supabase + token service + external HTTP at file top; import handler **after** mocks (Vitest hoisting). Full file: `src/pages/api/jira/jira-routes-secret-scan.test.ts`.

```typescript
import { afterEach, vi } from "vitest";
import { SECRET_PROBE } from "@/test/fixtures";
import { mockJiraFetchSuccess, setupAuthenticatedJiraUser, boardsPage } from "@/test/jira-route-mocks";
import { integrationTokenServiceMockModule } from "@/test/mock-integration-token-service";
import { mockAstroEnvServer } from "@/test/mock-server-deps";
import { supabaseClientMockModule } from "@/test/mock-supabase-client";
import { assertResponseBodyHasNoSecretProbe } from "@/test/secret-scan";

vi.mock("astro:env/server", () => mockAstroEnvServer);
vi.mock("@/lib/supabase", () => supabaseClientMockModule());
vi.mock("@/lib/services/integration-token-service", () => integrationTokenServiceMockModule());

import { GET } from "@/pages/api/jira/boards";

afterEach(() => {
  vi.unstubAllGlobals();
});

mockJiraFetchSuccess(boardsPage);
const response = await GET(setupAuthenticatedJiraUser());
await assertResponseBodyHasNoSecretProbe(response, SECRET_PROBE);
```

Use `@/test/jira-route-mocks` for Jira `fetch` stubs (`mockJiraFetchSuccess`, `mockJiraFetchUnauthorized`). Always scan success **and** error responses for probe leakage.

**RLS two-user fixture (Risk #5).** Real Supabase + real RLS — do not mock `IntegrationTokenService` for isolation proofs.

Prerequisites (local only) — all must be set for `isRlsSuiteEnabled()` to return true:

1. `npx supabase start` (Docker).
2. Copy env from `.env.example`; set:
   - `SUPABASE_URL` (localhost or 127.0.0.1 only — safety gate)
   - `SUPABASE_KEY`
   - `TOKEN_ENCRYPTION_KEY`
3. Configure two distinct test account credentials in `.env` (auto-created on first run via `signInOrSignUp`):
   - `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`
   - `TEST_USER_B_EMAIL` / `TEST_USER_B_PASSWORD`

Helpers in `@/test/rls-fixtures`:

- `isRlsSuiteEnabled()` — true only when local URL + all credentials above present.
- `describe.skipIf(!isRlsSuiteEnabled())` — default `npm run test` passes without Docker.
- `createSessionClient()`, `signInOrSignUp()`, `requireRlsTestCredentials()`, `requireEncryptionKey()`.

Run RLS suite explicitly (serial, env-file loaded):

```bash
npm run test:rls
```

**When to skip RLS locally vs CI.**

| Context | Default `npm run test` | `npm run test:rls` |
| ------- | ---------------------- | ------------------ |
| No Docker / missing env | RLS file skipped (`skipIf`) | RLS file skipped (`skipIf`) |
| Local Supabase + credentials complete | RLS runs in parallel full suite | **preferred** — serial single-worker run |
| CI (Phase 4+) | planned: skip or gate on secrets | planned: optional job with Supabase service |

Never point RLS tests at hosted/production Supabase — `isLocalSupabaseUrl()` enforces localhost only.

### 6.3 Adding an e2e test

TBD — not scheduled; integration preferred unless research proves SSR cookie gap.

### 6.4 Adding a test for a new API endpoint

TBD — see §3 Phase 2 (Jira JSON routes: mock HTTP edge, assert response shape + no secrets).

### 6.5 Adding a test for risk/computation logic

TBD — see §3 Phase 3 (calendar-connected assignee inclusion + qualitative band mapping).

### 6.6 Per-rollout-phase notes

**Phase 1 — Test runner bootstrap + security-critical paths** (`context/changes/testing-security-critical-paths/`): Vitest bootstrap; Risks #2 (token leakage scans), #3 (middleware/OAuth/API auth gates), #5 (two-user RLS). Key files: `src/test/secret-scan.ts`, `src/test/mock-api-context.ts`, `src/test/rls-fixtures.ts`, `src/middleware.auth-gates.test.ts`, `src/lib/services/integration-token-service.rls.test.ts`.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **UI component rendering and layout** — low blast radius for MVP; risk table correctness is asserted at data/API layer. Re-evaluate if UI becomes primary failure surface. (Source: Phase 2 interview Q5.)
- **Accessibility (axe, keyboard, screen-reader)** — excluded from test budget for MVP; EM-only internal tool with small user count. Re-evaluate before public launch or compliance requirement. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-07-04
- Stack versions last verified: 2026-07-04
- AI-native tool references last verified: 2026-07-04

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
