# Per-Person Sprint Risk Table Implementation Plan

## Overview

Build S-04, the north-star slice: a per-person sprint risk table showing story points, meeting hours, context switches, and a qualitative risk level (Low/Medium/High/Critical) for every connected assignee of a selected sprint. This closes the loop between the Jira sprint-picker (S-02) and the calendar-connect invite flow (S-03) with the first real risk computation in the codebase.

## Current State Analysis

- Jira side is ready: `getSprintAssignees` (`src/lib/services/jira-client.ts:259-284`) already aggregates per-assignee `totalStoryPoints`. No new Jira data is required for workload.
- Calendar side is 0% built: no code anywhere fetches Calendar events (`src/pages/api/invite/[token]/callback.ts` only stores OAuth tokens). No token-refresh mechanism exists — `expiresAt` is written but never read.
- The "connected assignees for this sprint" join does not exist. `SprintInviteService` (`src/lib/services/sprint-invite-service.ts`) has no bulk-by-sprint lookup.
- Risk computation is a blank slate — zero thresholds, weights, or types exist in `src/` or in any prior plan/archive.
- `sprint_invites` RLS (`supabase/migrations/20260719154551_sprint_invites.sql`) scopes reads to `auth.uid() = invited_by` — the EM viewing the dashboard **is** that user, so no admin client is needed to read invites for their own sprints.
- `integration_tokens` RLS scopes reads to `auth.uid() = user_id` — the connected assignee's `user_id`, not the EM's. Reading a connected assignee's Calendar token from the EM-facing route genuinely requires a service-role client.
- `src/lib/service-role-boundary.test.ts` currently hard-locks two invariants: only `src/lib/invite-api-context.ts` and `src/pages/api/account/delete.ts` may import `createAdminClient`, and `IntegrationTokenService` may never be constructed with an admin client anywhere. Both will need a deliberate, narrow update (see Critical Implementation Details).
- No Jira call exists that returns a single sprint's window (`startDate`/`endDate`) by `sprintId` alone. `listActiveFutureSprints` needs a `boardId`, which this feature's route will not have (mirrors the existing `assignees.ts` route, which also only receives `sprintId`).

## Desired End State

An EM who has selected a sprint on the dashboard sees a risk table below the existing assignee list, one row per assignee who has connected their Google Calendar (via S-03's invite flow), showing story points, meeting hours, context switches, and a qualitative risk band. Assignees who haven't connected are omitted (existing partial-results policy); assignees whose token expired or whose calendar fetch failed show a distinct, visible row state rather than disappearing.

Verification: select a sprint with at least one connected assignee on the live app; the risk table renders with correct-looking values within the spinner's visible-progress window, and `npm run test` / `npm run typecheck` / `npm run lint` pass.

### Key Discoveries:

- `getSprintAssignees` aggregation was deliberately built to "prepare data shape for S-04" (`context/archive/2026-06-14-jira-sprint-picker/plan.md:41`) — confirms no Jira-side change beyond a sprint-window-by-ID lookup is needed.
- S-03 explicitly deferred "consumption of stored calendar tokens" to S-04 (`context/archive/2026-07-19-assignee-calendar-invite/plan.md:33`) — Calendar client is 100% new work.
- `test-plan.md:57` (Risk #4) explicitly warns against "copying production threshold code into test expected value" — fixtures must be hand-derived from PRD scenarios, not mirrored from the implementation.
- `test-plan.md:54` (Risk #1) explicitly calls out "partial-results policy silently drops valid users" as the anti-pattern to avoid — driving the decision to show a distinct row state for token-expired/fetch-error assignees rather than omitting them.
- `resolveInviteAdminService()` (`src/lib/invite-api-context.ts:10-16`) is today's only sanctioned admin-client pattern, scoped to the public invite-token flow (the invitee is never `invited_by`). The EM-facing risk route has a different cross-user need (reading another user's `integration_tokens` row) that this helper doesn't cover.

## What We're NOT Doing

- Token refresh (exchanging `refreshToken` for a new access token). Expired tokens surface a "reconnect required" row state instead; refresh remains future work.
- Per-issue story-point granularity — the risk formula uses `getSprintAssignees`'s existing per-assignee total, not per-ticket detail.
- EM-delegated calendar read — per-user OAuth (already decided in S-03) is the only access model.
- Incremental/streaming progress UI, polling job-status endpoints, or any async job infrastructure — the existing full-page-spinner, single-request/response pattern satisfies the NFR.
- Persisting or caching computed risk results — recomputed fresh on every view, consistent with the PRD's data-minimization guardrail.
- Team-level or weekly risk visualization, AI summary layer, Slack/GitHub integrations (all explicit PRD non-goals).

## Implementation Approach

Follow the established layering: raw data fetch (Jira client, new Calendar client) → aggregation/scoring service (new risk-computation service, pure risk-scoring module) → thin route → React island. The risk-computation service is the one new place that needs a service-role client, justified by a narrow, explicit widening of the existing guardrail test rather than a silent bypass.

### Risk algorithm

Each signal (workload, meeting hours, context switches) is independently banded via fixed absolute thresholds, then combined by counting how many of the three signals landed in High or Critical:

| Signals at High/Critical | Overall band |
| ------------------------ | ------------ |
| 0                        | Low          |
| 1                        | Medium       |
| 2                        | High         |
| 3 (all three)            | Critical     |

This guarantees risk is always derived from the full triad — a single maxed-out signal (e.g. workload alone) can reach Medium at most, never Critical alone.

**Per-signal thresholds** (all absolute, over the sprint window; live as named constants, not scattered magic numbers):

| Signal                                | Low  | Medium | High   | Critical |
| ------------------------------------- | ---- | ------ | ------ | -------- |
| Workload (story points, per assignee) | ≤ 5  | 6–10   | 11–15  | ≥ 16     |
| Meeting hours (aggregate)             | < 5h | 5–15h  | 15–25h | > 25h    |
| Context switches (count)              | 0–3  | 4–8    | 9–15   | ≥ 16     |

These are provisional, deliberately isolated in one constants module so they're a single-place edit if real-world usage shows they need retuning — no code archaeology required.

### Calendar event handling

- Fetch is unfiltered `events.list` — no exclusion by attendee count or RSVP response status (declined/tentative events count same as accepted).
- All-day events (Google represents these with a `date` field, not `dateTime`) carry no time-of-day boundary and are excluded from both meeting-hours and context-switch math — a technical necessity of the data shape, not a filtering policy.
- Context switches count every work↔meeting transition with zero gap tolerance, per the PRD's literal business-logic wording.

## Critical Implementation Details

**Sprint window lookup**: the risk route only receives `sprintId` (mirroring `assignees.ts`), not `boardId`, so the existing `listActiveFutureSprints(boardId)` cannot supply the window. Add `getSprintById(siteUrl, pat, accountEmail, sprintId)` to `jira-client.ts` calling `GET /rest/agile/1.0/sprint/{sprintId}` directly.

**Service-role guardrail update**: `service-role-boundary.test.ts` today asserts zero files construct `IntegrationTokenService` with an admin client, and exactly two files may import `createAdminClient`. The risk-computation service needs both, to read a connected assignee's Calendar token (owned by their `user_id`, unreachable via the EM's own RLS-scoped client). Update the test to an explicit allowlist (e.g. `ALLOWED_ADMIN_TOKEN_SERVICE_FILES = ["src/lib/services/risk-computation-service.ts"]`) rather than deleting the check — it keeps catching any _other_ file that tries the same pattern, while permitting this one reviewed call site. This is a deliberate, narrow loosening of a real security invariant, not a silent one — worth a second pair of eyes at review time.

**Row status is one of four, mutually exclusive**: `not_connected` (no invite consumed — omitted entirely, unchanged from S-03's existing policy), `reconnect_required` (token's `expiresAt` has passed — detected before any Calendar call, no fetch attempted), `error` (Calendar API call failed for any other reason — 401/403/5xx/timeout), `ok` (full metrics computed). Rows sort by risk severity descending (Critical → Low, ties by display name), mirroring `getSprintAssignees`'s existing "worst first" convention.

## Phase 1: Risk computation core

### Overview

Pure, side-effect-free risk scoring: types, threshold constants, and the banding/combination logic — independently testable against hand-authored PRD-scenario fixtures before any Calendar or Jira integration exists.

### Changes Required:

#### 1. Types

**File**: `src/types.ts`

**Intent**: Add the shared vocabulary for risk rows so every downstream layer (service, route, UI) references the same shapes.

**Contract**: Export `RiskBand = "low" | "medium" | "high" | "critical"`, `RiskRowStatus = "ok" | "reconnect_required" | "error"`, and `AssigneeRiskRow` (`accountId: string`, `displayName: string`, `totalStoryPoints: number`, `meetingHours: number`, `contextSwitches: number`, `riskBand: RiskBand`, `status: RiskRowStatus`).

#### 2. Risk thresholds and scoring

**File**: `src/lib/services/risk-scoring.ts` (new)

**Intent**: Single source of truth for the numeric bands and the triad-combination rule described in Implementation Approach above.

**Contract**: Export the three threshold tables as named constants, a `bandForValue(value, thresholds): RiskBand` helper, and `computeRiskBand(totalStoryPoints, meetingHours, contextSwitches): RiskBand` implementing the "count of signals at High/Critical" rule.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- src/lib/services/risk-scoring.test.ts`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- None — pure logic, fully covered by automated tests.

---

## Phase 2: Google Calendar client

### Overview

Net-new service fetching a connected assignee's Calendar events for the sprint window and deriving meeting hours + context switches, following the existing `jira-client.ts` convention (raw `fetch` + `AbortSignal.timeout`, own pagination loop).

### Changes Required:

#### 1. Calendar client

**File**: `src/lib/services/google-calendar-client.ts` (new)

**Intent**: Fetch primary-calendar events for a given access token and time window, then reduce them to the two derived metrics the risk algorithm needs.

**Contract**: Export `fetchCalendarEvents(accessToken, timeMin, timeMax): Promise<CalendarEvent[]>` calling `GET https://www.googleapis.com/calendar/v3/calendars/primary/events` with `singleEvents=true`, `orderBy=startTime`, `timeMin`/`timeMax`, paginating via `nextPageToken` (mirror `PAGE_SIZE`/`MAX_PAGES`/`TIMEOUT_MS` constants from `jira-client.ts`). Export `computeMeetingMetrics(events, sprintStart, sprintEnd): { meetingHours: number; contextSwitches: number }` — filters out events without a `dateTime` (all-day), clips to the sprint window, sorts chronologically, sums duration, counts every work↔meeting transition with zero gap tolerance. Export `isTokenExpired(payload: GoogleCalendarTokenPayload): boolean` comparing `expiresAt` to now. Export a `CalendarApiError` class (same `userMessage` contract as `JiraValidationError`) for non-2xx/timeout responses, thrown separately from the pre-flight `isTokenExpired` check so callers can distinguish `reconnect_required` from `error`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- src/lib/services/google-calendar-client.test.ts`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- None — covered by mocked-fetch unit tests; real-token behavior verified in Phase 5's manual pass.

---

## Phase 3: Cross-user data assembly

### Overview

Wire together Jira sprint data, the sprint's connected-assignee invites, and each connected assignee's Calendar token into one orchestration service. This is the phase that touches the service-role guardrail.

### Changes Required:

#### 1. Bulk invite lookup

**File**: `src/lib/services/sprint-invite-service.ts`

**Intent**: Add the "all invites for this sprint" query the risk service needs to find connected assignees.

**Contract**: Add `getInvitesBySprintId(sprintId: number): Promise<SprintInvite[]>` on `SprintInviteService`, using the instance's own (EM-scoped) Supabase client — no admin client needed here since `auth.uid() = invited_by` already matches the viewing EM under existing RLS.

#### 2. Sprint window by ID

**File**: `src/lib/services/jira-client.ts`

**Intent**: Supply the sprint window without requiring a `boardId` the route doesn't have (see Critical Implementation Details).

**Contract**: Add `getSprintById(siteUrl, pat, accountEmail, sprintId): Promise<JiraSprint>` calling `GET /rest/agile/1.0/sprint/{sprintId}` via the existing `fetchJiraJson` helper.

#### 3. Risk-computation orchestrator

**File**: `src/lib/services/risk-computation-service.ts` (new)

**Intent**: Compose Jira workload, connected-assignee lookup, Calendar tokens, and Calendar fetch into the final `AssigneeRiskRow[]`. This is the one file allowlisted to construct `IntegrationTokenService` with an admin client.

**Contract**: Export `computeSprintRisk({ siteUrl, pat, accountEmail, sprintId, supabase, adminClient, encryptionKey }): Promise<AssigneeRiskRow[]>`. Internally: fetch `getSprintAssignees` + `getSprintById` for workload and window; fetch `getInvitesBySprintId` via the EM-scoped `supabase` client, filter to `status === "consumed" && connectedUserId !== null`; for each, construct `IntegrationTokenService(adminClient, encryptionKey)` and call `getGoogleCalendarTokens(connectedUserId)`; branch on `isTokenExpired` → `reconnect_required`, Calendar fetch failure → `error`, success → `ok` with `computeRiskBand(...)`. Sort by risk severity descending per Critical Implementation Details.

#### 4. Guardrail update

**File**: `src/lib/service-role-boundary.test.ts`

**Intent**: Permit the one new, reviewed cross-user call site without silently dropping the guardrail for the rest of the codebase.

**Contract**: Replace the blanket "zero violations" assertion for the `IntegrationTokenService`+admin-client check with an explicit allowlist containing `src/lib/services/risk-computation-service.ts`; widen the `createAdminClient` importer list to include the same file.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- src/lib/services/risk-computation-service.test.ts`
- Guardrail test passes with updated allowlist: `npm run test -- src/lib/service-role-boundary.test.ts`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- None — fully mockable orchestration logic.

---

## Phase 4: API route

### Overview

Thin route exposing `computeSprintRisk`, following the exact shape of the existing `assignees.ts` route.

### Changes Required:

#### 1. Risk route

**File**: `src/pages/api/jira/sprints/[sprintId]/risk.ts` (new)

**Intent**: Authenticate, resolve Jira + Supabase + admin-client + encryption-key context, call the orchestrator, return JSON.

**Contract**: `export const prerender = false`. `GET` handler: `parsePositiveInt(context.params.sprintId)` → 400 if invalid; `resolveJiraApiContext(context)` → return early if it's a `Response`; construct the EM-scoped Supabase client via `createClient(context.request.headers, context.cookies)`; `createAdminClient()` and `TOKEN_ENCRYPTION_KEY` → 503 if either is missing (matches `jira-api-context.ts`'s existing config-error convention); call `computeSprintRisk(...)` in a try/catch, mapping errors via `mapJiraClientError`; respond `{ sprintId, rows }`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test -- src/pages/api/jira/sprints/[sprintId]/risk.test.ts`
- Secret-scan assertion passes (no PAT/token/accessToken/refreshToken in response body): part of the same test file, using `@/test/secret-scan`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- `GET /api/jira/sprints/<real-sprint-id>/risk` against a live sprint with at least one connected assignee returns a 200 with plausible values.

---

## Phase 5: UI — SprintRiskTable

### Overview

React island rendering the risk table, reusing the existing spinner/error-banner conventions from `SprintPicker.tsx`, wired in below the existing assignee table.

### Changes Required:

#### 1. Data hook

**File**: `src/components/hooks/use-sprint-risk-table.ts` (new)

**Intent**: Fetch risk rows whenever the selected sprint changes, mirroring `use-jira-sprint-picker.ts`'s `loadAssignees` request-guarding pattern (stale-response protection via a request-id ref).

**Contract**: Export `useSprintRiskTable(sprintId: number | null)` returning `{ rows, loading, error, retry }`.

#### 2. Table component

**File**: `src/components/dashboard/SprintRiskTable.tsx` (new)

**Intent**: Render one row per `AssigneeRiskRow`, with `reconnect_required`/`error` statuses shown as visible muted text (not omitted), and `riskBand` shown as a colored badge.

**Contract**: Props `{ sprintId: number }`. Reuses `Table`/`TableBody`/`TableHead` from `@/components/ui/table` and the existing full-page-spinner/`ServerError` pattern from `SprintPicker.tsx`.

#### 3. Dashboard wiring

**File**: `src/components/dashboard/SprintPicker.tsx`

**Intent**: Render the new table below the existing `AssigneeTable` once a sprint is selected.

**Contract**: Add `<SprintRiskTable sprintId={selectedSprintId} />` inside the existing `selectedSprintId !== null` branch, alongside `AssigneeTable`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Select a sprint with ≥1 connected assignee on the running app: risk table renders below the assignee table with correct row values and risk badges.
- Select a sprint with an assignee whose token has expired (or simulate via DB): row shows visible "reconnect required" state, not silently omitted.
- Full-page spinner is continuously visible for the duration of the request (satisfies the >2s NFR via existing pattern).

---

## Phase 6: Testing and readiness check

### Overview

Round out coverage per `test-plan.md`'s risk map (#1, #4, #7) and confirm no hosted-environment changes are needed.

### Changes Required:

#### 1. Fixture-based risk-band tests

**File**: `src/lib/services/risk-scoring.test.ts`

**Intent**: Hand-authored fixtures derived from PRD scenarios (not copied from `risk-scoring.ts`'s own thresholds) proving each band boundary and the "never workload alone" triad rule (e.g. workload alone at max with meeting hours/switches both Low → Medium, not Critical).

#### 2. Calendar client tests

**File**: `src/lib/services/google-calendar-client.test.ts`

**Intent**: Cover all-day exclusion, pagination, timeout/error mapping, and context-switch/meeting-hour derivation against fixed mock event sets.

#### 3. Orchestration and route tests

**Files**: `src/lib/services/risk-computation-service.test.ts`, `src/pages/api/jira/sprints/[sprintId]/risk.test.ts`

**Intent**: Cover all four row statuses branching correctly; extend `mock-sprint-invite-service.ts` with a `mockGetInvitesBySprintId` export following the existing pattern; assert no secret leakage via `assertResponseBodyHasNoSecretProbe`.

### Success Criteria:

#### Automated Verification:

- Full suite passes: `npm run test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- No new Supabase migration required (confirmed — reuses `integration_tokens` and `sprint_invites`).
- No new runtime secrets required (confirmed — reuses `TOKEN_ENCRYPTION_KEY`).

---

## Testing Strategy

### Unit Tests:

- `risk-scoring.ts`: every band boundary per signal, plus the triad-combination rule (0/1/2/3 signals at High+ → Low/Medium/High/Critical).
- `google-calendar-client.ts`: all-day exclusion, pagination limits, timeout mapping, context-switch counting across a mocked event sequence.
- `risk-computation-service.ts`: all four `RiskRowStatus` branches, sort order.

### Integration Tests:

- `risk.ts` route: authenticated happy path, missing-config 503s, invalid sprintId 400, secret-scan assertion on the response body.

### Manual Testing Steps:

1. Select a sprint with a mix of connected/unconnected/expired-token assignees; verify all four row states render distinctly.
2. Verify the spinner stays visible for the whole request duration and disappears only on completion.
3. Verify no PAT, access token, or refresh token ever appears in the Network tab response body.

## Performance Considerations

Calendar fetch reuses the same pagination-limit discipline as `jira-client.ts` (`PAGE_SIZE`/`MAX_PAGES`/`TIMEOUT_MS`) to bound worst-case latency per assignee; the risk-computation service fetches assignees' calendars sequentially in this slice — parallelizing is a future optimization if the >2s NFR proves hard to hit with several connected assignees.

## Migration Notes

None. No new Supabase tables or columns — reuses `integration_tokens` and `sprint_invites` as-is.

## References

- Research: `context/changes/sprint-risk-table/research.md`
- Existing aggregation precedent: `src/lib/services/jira-client.ts:259-284` (`getSprintAssignees`)
- Existing route shape to mirror: `src/pages/api/jira/sprints/[sprintId]/assignees.ts`
- Admin-client precedent (different use case): `src/lib/invite-api-context.ts:10-16`
- Guardrail to update: `src/lib/service-role-boundary.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Risk computation core

#### Automated

- [x] 1.1 Unit tests pass: `npm run test -- src/lib/services/risk-scoring.test.ts` — f80b206
- [x] 1.2 Type checking passes: `npm run typecheck` — f80b206
- [x] 1.3 Linting passes: `npm run lint` — f80b206

### Phase 2: Google Calendar client

#### Automated

- [x] 2.1 Unit tests pass: `npm run test -- src/lib/services/google-calendar-client.test.ts` — c492276
- [x] 2.2 Type checking passes: `npm run typecheck` — c492276
- [x] 2.3 Linting passes: `npm run lint` — c492276

### Phase 3: Cross-user data assembly

#### Automated

- [x] 3.1 Unit tests pass: `npm run test -- src/lib/services/risk-computation-service.test.ts` — 4a2afda
- [x] 3.2 Guardrail test passes with updated allowlist: `npm run test -- src/lib/service-role-boundary.test.ts` — 4a2afda
- [x] 3.3 Type checking passes: `npm run typecheck` — 4a2afda
- [x] 3.4 Linting passes: `npm run lint` — 4a2afda

### Phase 4: API route

#### Automated

- [x] 4.1 Unit tests pass: `npm run test -- src/pages/api/jira/sprints/[sprintId]/risk.test.ts` — f1beec3
- [x] 4.2 Secret-scan assertion passes — f1beec3
- [x] 4.3 Type checking passes: `npm run typecheck` — f1beec3
- [x] 4.4 Linting passes: `npm run lint` — f1beec3

#### Manual

- [ ] 4.5 `GET /api/jira/sprints/<real-sprint-id>/risk` against a live sprint returns 200 with plausible values

### Phase 5: UI — SprintRiskTable

#### Automated

- [x] 5.1 Type checking passes: `npm run typecheck`
- [x] 5.2 Linting passes: `npm run lint`

#### Manual

- [ ] 5.3 Risk table renders below assignee table with correct values and badges
- [ ] 5.4 Expired-token assignee shows visible "reconnect required" state, not omitted
- [ ] 5.5 Full-page spinner stays visible for entire request duration

### Phase 6: Testing and readiness check

#### Automated

- [ ] 6.1 Full suite passes: `npm run test`
- [ ] 6.2 Type checking passes: `npm run typecheck`
- [ ] 6.3 Linting passes: `npm run lint`
- [ ] 6.4 Build succeeds: `npm run build`

#### Manual

- [ ] 6.5 No new Supabase migration required (confirmed)
- [ ] 6.6 No new runtime secrets required (confirmed)
