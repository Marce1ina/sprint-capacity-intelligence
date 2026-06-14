# Jira Sprint Picker Implementation Plan

## Overview

Implement S-02 (FR-003): replace the dashboard placeholder with an interactive sprint picker that loads boards and active/future sprints from Jira Agile REST API, then displays assignees with total story points for the selected sprint. This is the first server-side Jira read integration and the first JSON API + React island on the dashboard.

## Current State Analysis

S-01 delivered Google OAuth, Jira PAT onboarding, encrypted token storage, and middleware that gates `/dashboard` behind a Jira token. The Jira client (`src/lib/services/jira-client.ts`) only validates credentials via `GET /rest/api/3/myself` using Basic auth (`email:pat`). `IntegrationTokenService.getJiraPat()` is implemented but never called. The dashboard (`src/pages/dashboard.astro`) is a static welcome card with no data fetching. No sprint, board, or assignee types exist in `src/types.ts`. All existing API routes use form POST + redirect; no JSON endpoints exist.

### Key Discoveries:

- Basic auth format and 10s timeout pattern in `jira-client.ts:11-31` — extend, do not duplicate
- Site URL SSRF guard in `src/lib/jira-site-url.ts` — call `assertAllowedJiraSiteUrl` before every outbound fetch
- Safe error mapping via `JiraValidationError.userMessage` in `src/types.ts:24-32` — reuse pattern for API JSON responses
- Onboarding UI patterns in `JiraPatForm.tsx` and `ServerError.tsx` — reuse on dashboard
- Roadmap unknown (Jira API shape) resolved via Agile REST: boards → sprints (`state=active,future`) → sprint issues

## Desired End State

An authenticated EM with a stored Jira PAT opens `/dashboard`, selects a board from a dropdown, selects an active or future sprint, and sees a table listing each assignee (plus an "Unassigned" row when applicable) with total story points summed across sprint issues. Loading shows a full-page spinner; failures show a `ServerError` banner with retry. Selected board/sprint IDs live in React state only (lost on reload). No PAT or decrypted tokens appear in responses or logs.

### Verification

1. Automated: `npm run lint` and `npm run build` pass
2. Manual: real Jira Cloud site with scrum board → board list loads → sprint list filters to active/future → assignee table shows names and point totals → invalid PAT shows safe error with retry

## What We're NOT Doing

- Persisting selected board/sprint to DB or cookies (deferred to S-03/S-04)
- Calendar connect or invite flows (S-03)
- Risk computation or per-person risk table (S-04)
- Closed/historical sprints
- Custom story-point field ID discovery or board configuration in onboarding
- Jira write operations (create/update issues, move to sprint)
- Automated test suite (follow S-01 manual verification pattern)
- Service-role Supabase client

## Implementation Approach

Extend `jira-client.ts` with a shared authenticated fetch helper and three read methods aligned to Jira Agile REST. Expose them via three granular JSON API routes under `src/pages/api/jira/`. Replace the dashboard placeholder with an Astro shell + `SprintPicker` React island (`client:load`) that orchestrates fetches and renders board/sprint selects plus an assignee table. Server-side aggregation of story points by assignee keeps the client thin and prepares data shape for S-04.

## Critical Implementation Details

Jira Cloud PAT auth for Agile endpoints uses the same Basic `email:pat` header as `/rest/api/3/myself` — not Bearer. Request story points via the Agile sprint issues endpoint using the `storyPoints` field alias (`fields=assignee,storyPoints`; read `fields.storyPoints ?? 0`). This alias works on default Jira Software scrum boards but is instance-dependent — **Phase 1 must include a mandatory real-Jira spike** that confirms non-zero point totals before Phase 2 starts; if the spike fails, escalate to board-configuration field resolution in a follow-up. When `assignee` is null, bucket the issue under a synthetic `"Unassigned"` entry so EMs still see unallocated workload.

## Phase 1: Jira Client & Types

### Overview

Add DTO types and extend the Jira client with a reusable fetch helper plus board, sprint, and assignee-aggregation methods.

### Changes Required:

#### 1. Sprint/board DTO types

**File**: `src/types.ts`

**Intent**: Define typed contracts for API responses and client return values so routes and UI share one shape.

**Contract**: Add `JiraBoard` (`id: number`, `name: string`, `type?: string`), `JiraSprint` (`id: number`, `name: string`, `state: string`, `startDate?: string`, `endDate?: string`), `SprintAssignee` (`accountId: string | null`, `displayName: string`, `totalStoryPoints: number`), and `JiraApiError` (extends `Error` with `userMessage: string`, mirroring `JiraValidationError` — or generalize the existing class name if preferred, but keep the `userMessage` contract).

#### 2. Shared Jira fetch helper

**File**: `src/lib/services/jira-client.ts`

**Intent**: DRY authenticated fetch with timeout, SSRF guard, and HTTP error mapping for all Jira read calls.

**Contract**: Extract `buildBasicAuthHeader` usage into an internal `fetchJiraJson<T>(siteUrl, pat, accountEmail, path, searchParams?)` that calls `assertAllowedJiraSiteUrl`, applies 10s timeout, parses JSON, and throws `JiraValidationError` (or `JiraApiError`) with safe `userMessage` for 401/403/404/timeout/network failures. Refactor `validateJiraCredentials` to use this helper.

#### 3. Board, sprint, and assignee methods

**File**: `src/lib/services/jira-client.ts`

**Intent**: Encapsulate Agile REST paths and assignee aggregation so API routes stay thin.

**Contract**:

- `listBoards(siteUrl, pat, email)` → `GET /rest/agile/1.0/board` (paginate with `startAt`/`maxResults` until `isLast`; response collection key is `values[]`; default `maxResults=50`)
- `listActiveFutureSprints(siteUrl, pat, email, boardId)` → `GET /rest/agile/1.0/board/{boardId}/sprint?state=active,future` (paginate with `startAt`/`maxResults` until `isLast`; response collection key is `values[]`; default `maxResults=50`)
- `getSprintAssignees(siteUrl, pat, email, sprintId)` → `GET /rest/agile/1.0/sprint/{sprintId}/issue?fields=assignee,storyPoints` (paginate with `startAt`/`maxResults` until `isLast`; response collection key is `issues[]`, **not** `values[]`); aggregate by `assignee.accountId` (or `"unassigned"` key when null), sum `fields.storyPoints ?? 0`, return sorted `SprintAssignee[]` descending by points. Relies on `storyPoints` field alias — validated by mandatory Phase 1 spike (see Manual Verification).

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npm run build`
- No new env vars required beyond existing `TOKEN_ENCRYPTION_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`

#### Manual Verification:

- **Mandatory gate (blocks Phase 2):** Exercise `getSprintAssignees` via temporary script or route stub against a real Jira Cloud scrum site; confirm `fields.storyPoints` returns non-zero totals for at least one sprint with estimated issues. If alias fails, stop and revisit field resolution before proceeding.
- Error paths return safe messages, not raw Jira response bodies

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: JSON API Routes

### Overview

Add three authenticated JSON endpoints that load stored Jira credentials and delegate to the client methods from Phase 1.

### Changes Required:

#### 1. Boards endpoint

**File**: `src/pages/api/jira/boards.ts`

**Intent**: Return the EM's accessible Jira boards for the board picker dropdown.

**Contract**: `export const prerender = false`; `GET` handler checks `context.locals.user`, returns 401 JSON if missing; loads `getJiraPat(user.id)` via session Supabase client + `IntegrationTokenService`; returns `{ boards: JiraBoard[] }` or `{ error: string }` with appropriate status. Map `JiraValidationError`/`JiraApiError` to `{ error: userMessage }`. Never include PAT in response.

#### 2. Sprints endpoint

**File**: `src/pages/api/jira/boards/[boardId]/sprints.ts`

**Intent**: Return active and future sprints for a selected board.

**Contract**: `GET` with dynamic `boardId` param (validate numeric); same auth/token pattern; call `listActiveFutureSprints`; return `{ sprints: JiraSprint[] }`. Return 400 for invalid board ID.

#### 3. Assignees endpoint

**File**: `src/pages/api/jira/sprints/[sprintId]/assignees.ts`

**Intent**: Return aggregated assignee workload for the selected sprint.

**Contract**: `GET` with dynamic `sprintId`; same auth/token pattern; call `getSprintAssignees`; return `{ assignees: SprintAssignee[], sprintId: number }`.

#### 4. Shared route helper (optional)

**File**: `src/lib/jira-api-context.ts` (or inline in each route if helper feels over-engineered)

**Intent**: Avoid duplicating auth + token retrieval + email check across three routes.

**Contract**: Function accepting `APIContext`, returning `{ user, pat, siteUrl, email }` or a `Response` error — used by all three Jira API routes. Error responses: `401` JSON when `context.locals.user` is missing; `403` JSON `{ error: "Jira is not configured. Complete onboarding first." }` when `getJiraPat()` returns null; `400` JSON `{ error: "Jira site URL is missing. Reconnect Jira in onboarding." }` when stored payload lacks `siteUrl`; normalize via `assertAllowedJiraSiteUrl` before returning success. Return `503` JSON when Supabase client or `TOKEN_ENCRYPTION_KEY` is unavailable (same pattern as onboarding).

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Unauthenticated request returns 401 JSON
- Authenticated request without stored Jira token returns 403 JSON with safe message
- Authenticated request with token missing siteUrl returns 400 JSON with safe message
- Authenticated request with valid PAT returns boards JSON
- Valid board ID returns active/future sprints only
- Valid sprint ID returns assignee aggregation with story point totals
- Expired/invalid PAT returns safe error JSON (not 500 with stack trace)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Dashboard Sprint Picker UI

### Overview

Replace the dashboard placeholder with a React island that drives board/sprint selection and displays assignees.

### Changes Required:

#### 1. shadcn components

**File**: `src/components/ui/select.tsx` (and `table.tsx` if table markup benefits from shadcn primitives)

**Intent**: Provide accessible select controls for board/sprint pickers consistent with project UI conventions.

**Contract**: Add via `npx shadcn@latest add select` (and `table` if used). Use `cn()` from `@/lib/utils` for conditional classes.

#### 2. Data-fetching hook

**File**: `src/components/hooks/use-jira-sprint-picker.ts`

**Intent**: Centralize fetch orchestration, loading state, error state, and retry logic for the three API endpoints.

**Contract**: Hook accepts no server props; exposes `{ boards, sprints, assignees, selectedBoardId, selectedSprintId, setSelectedBoardId, setSelectedSprintId, loading, error, retry }`. On board change, refetch sprints and clear assignees. On sprint change, fetch assignees. Full-page loading flag true during any in-flight fetch.

#### 3. Sprint picker component

**File**: `src/components/dashboard/SprintPicker.tsx`

**Intent**: Render board select, sprint select, assignee table, full-page spinner overlay, and error banner with retry.

**Contract**: Default export React component; uses hook from above; reuses `ServerError` for error banner; displays assignee table columns: Name, Story Points; shows empty state when no sprint selected; full-page centered spinner when `loading` is true (covers card content). No `"use client"` directive.

#### 4. Dashboard page wiring

**File**: `src/pages/dashboard.astro`

**Intent**: Replace placeholder content with the sprint picker island while keeping sign-out and layout shell.

**Contract**: Import `SprintPicker`; render inside expanded card layout (wider than onboarding card to fit table); `<SprintPicker client:load />`; retain sign-out control. Keep cosmic glass styling consistent with onboarding.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Dashboard loads board dropdown after auth
- Selecting board loads active/future sprints
- Selecting sprint shows assignee table with story point totals
- Full-page spinner visible during fetches
- Jira failure shows error banner; retry re-fetches successfully
- Page refresh clears selection (ephemeral state confirmed)
- Sign-out still works

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Production Readiness

### Overview

Verify hosted environment and document smoke steps per `context/foundation/lessons.md` — no new infra, but confirm prod Jira integration works end-to-end.

### Changes Required:

#### 1. README / AGENTS update

**File**: `README.md`, `AGENTS.md`

**Intent**: Document new API routes, dashboard behavior, and Jira PAT permission requirements for production smoke.

**Contract**: Add dashboard sprint picker flow to README user journey; list three `/api/jira/*` routes in AGENTS.md API section; note PAT needs browse permission for boards/sprints/issues.

#### 2. Production smoke checklist

**File**: `context/changes/jira-sprint-picker/plan.md` (this plan — executed manually, not a new file)

**Intent**: Prevent repeat of S-01 hosted-config gaps.

**Contract**: Manual checklist: (1) hosted Supabase has `integration_tokens` table and EM has Jira token row, (2) `TOKEN_ENCRYPTION_KEY` set in Cloudflare Worker, (3) open prod `/dashboard`, (4) board/sprint/assignee flow succeeds against real Jira site, (5) no PAT in browser network responses.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build passes: `npm run build`
- CI workflow unchanged and green on PR

#### Manual Verification:

- Production smoke checklist completed on live Worker URL
- README accurately describes sprint picker flow

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None for MVP (consistent with S-01/F-01). Logic-heavy aggregation in `getSprintAssignees` is a candidate for post-MVP unit tests.

### Integration Tests:

- Manual fetch against three API routes with valid/invalid session

### Manual Testing Steps:

1. Sign in with Google; complete onboarding with valid Jira PAT if not already done
2. Open `/dashboard` — boards load in dropdown
3. Select a board — only active/future sprints appear
4. Select a sprint — assignee table shows names and summed story points
5. Revoke or invalidate PAT in Jira — retry shows safe error banner
6. Refresh page — selection clears (ephemeral)
7. Repeat steps 2–4 on production Worker URL

## Performance Considerations

Sprint issue pagination may require multiple Jira calls for large sprints. Paginate with `maxResults=50` and aggregate server-side. Full-page spinner satisfies PRD progress visibility for operations that may exceed two seconds on large sprints. No caching in S-02 — acceptable for single-EM MVP traffic.

## Migration Notes

No database migration required. Ephemeral sprint selection means no schema changes. If S-03/S-04 require persisted selection, add a `user_preferences` table or extend token metadata in a future slice.

## References

- Roadmap: `context/foundation/roadmap.md` (S-02)
- PRD: `context/foundation/prd.md` (FR-003)
- Prior art: `context/archive/2026-06-13-google-auth-jira-onboarding/plan.md`
- Jira Agile REST: `GET /rest/agile/1.0/board`, `/board/{id}/sprint`, `/sprint/{id}/issue`
- Lessons: `context/foundation/lessons.md` (production readiness checklist)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Jira Client & Types

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — d5bcd9b
- [x] 1.2 Production build passes: `npm run build` — d5bcd9b
- [x] 1.3 No new env vars required beyond existing secrets — d5bcd9b

#### Manual

- [x] 1.4 Mandatory real-Jira spike confirms `storyPoints` alias returns non-zero totals — d5bcd9b
- [x] 1.5 Error paths return safe messages, not raw Jira response bodies — d5bcd9b

### Phase 2: JSON API Routes

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — 0730234
- [x] 2.2 Production build passes: `npm run build` — 0730234

#### Manual

- [x] 2.3 Unauthenticated request returns 401 JSON — 0730234
- [x] 2.4 Authenticated request without Jira token returns 403 JSON — 0730234
- [x] 2.5 Authenticated request with missing siteUrl returns 400 JSON — 0730234
- [x] 2.6 Authenticated request with valid PAT returns boards JSON — 0730234
- [x] 2.7 Valid board ID returns active/future sprints only — 0730234
- [x] 2.8 Valid sprint ID returns assignee aggregation with story point totals — 0730234
- [x] 2.9 Expired/invalid PAT returns safe error JSON — 0730234

### Phase 3: Dashboard Sprint Picker UI

#### Automated

- [x] 3.1 Linting passes: `npm run lint`
- [x] 3.2 Production build passes: `npm run build`

#### Manual

- [x] 3.3 Dashboard loads board dropdown after auth
- [x] 3.4 Selecting board loads active/future sprints
- [x] 3.5 Selecting sprint shows assignee table with story point totals
- [x] 3.6 Full-page spinner visible during fetches
- [x] 3.7 Jira failure shows error banner with retry
- [x] 3.8 Page refresh clears selection (ephemeral state)
- [x] 3.9 Sign-out still works

### Phase 4: Production Readiness

#### Automated

- [ ] 4.1 Linting passes: `npm run lint`
- [ ] 4.2 Production build passes: `npm run build`
- [ ] 4.3 CI workflow unchanged and green on PR

#### Manual

- [ ] 4.4 Production smoke checklist completed on live Worker URL
- [ ] 4.5 README accurately describes sprint picker flow
