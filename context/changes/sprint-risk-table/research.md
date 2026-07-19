---
date: 2026-07-19T17:37:57+02:00
researcher: Claude Code
git_commit: f8666078b2c858b16d7f4120cd6abced9cfbc466
branch: master
repository: sprint-capacity-intelligence
topic: "S-04 sprint-risk-table: integration points for Jira/calendar risk computation"
tags: [research, codebase, jira-client, integration-token-service, sprint-invite-service, risk-computation]
status: complete
last_updated: 2026-07-19
last_updated_by: Claude Code
---

# Research: S-04 sprint-risk-table — integration points for per-person risk computation

**Date**: 2026-07-19T17:37:57+02:00
**Researcher**: Claude Code
**Git Commit**: f8666078b2c858b16d7f4120cd6abced9cfbc466
**Branch**: master
**Repository**: sprint-capacity-intelligence

## Research Question

For S-04 (sprint-risk-table, north star slice, FR-006/FR-007): what already exists in the codebase for (1) Jira sprint/story-point data, (2) connected-assignee calendar data, and (3) risk-computation logic — and what is net-new work? Scope: quick integration-points overview (not a deep algorithm design).

## Summary

- **Jira side is mostly ready.** `getSprintAssignees` already aggregates per-assignee story points from the sprint's issues. `listActiveFutureSprints` already returns the sprint window (`startDate`/`endDate`). Nothing new to fetch — the only gap is that no single call/route merges "sprint window" + "per-person story points," and no route exposes per-issue granularity (only the aggregated per-assignee total).
- **Calendar side is 100% net-new.** S-03 built only the OAuth handshake and encrypted token storage (`calendar.readonly` scope, `integration_tokens` table). No code anywhere fetches Calendar events, and no token-refresh mechanism exists (`expiresAt` is written but never checked). There's also no existing query to go from "this sprint's assignees" to "which have a connected calendar token" — that join has to be built from `sprint_invites` + `IntegrationTokenService`.
- **Risk computation is a blank slate.** No risk/threshold/band/context-switch code or types exist anywhere in `src/`. The PRD defines the _shape_ of the algorithm (workload + meeting hours + context switches → qualitative band) but zero numeric thresholds or weights. The only artifact that goes further is a set of exploratory, non-canonical DDD design docs under `context/domain/` (course-exercise framing, "no production code written") that sketch types and invariants but stop short of a formula. Threshold tuning remains a genuinely open design decision, as `change.md` already flags.

## Detailed Findings

### Jira data availability

- `listBoards` (`src/lib/services/jira-client.ts:233-241`) → `JiraBoard[]` (`id`, `name`, `type?`), from `GET /rest/agile/1.0/board`.
- `listActiveFutureSprints` (`jira-client.ts:243-257`) → `JiraSprint[]` (`id`, `name`, `state`, `startDate?`, `endDate?`), from `GET /rest/agile/1.0/board/{boardId}/sprint`. **Sprint window is already available** — `startDate`/`endDate` as raw unparsed ISO strings, typed in `src/types.ts:43-49`. Only exposed via `/api/jira/boards/[boardId]/sprints`, not via the assignees route.
- `listSprintIssues` (`jira-client.ts:210-227`, internal, not routed) → `SprintIssue[]` with per-issue `storyPoints`, sourced via `readStoryPoints()` (`jira-client.ts:39-47`) reading Jira field `storyPoints` or custom field `customfield_10016`, from `GET /rest/agile/1.0/sprint/{sprintId}/issue` (`jira-client.ts:187`). `SprintIssue` is defined and exported from `jira-client.ts` only — **not** re-exported from `src/types.ts`.
- `getSprintAssignees` (`jira-client.ts:259-284`) → `SprintAssignee[]` (`accountId`, `displayName`, `totalStoryPoints`), already aggregating `listSprintIssues` output per assignee (unassigned bucketed under literal `"unassigned"`, line 269). Exposed via `/api/jira/sprints/[sprintId]/assignees`. Typed in `src/types.ts:51-55`.
- **No Jira "sprint report" (velocity/burndown) endpoint is used or needed.** Per-issue story points already come from the existing sprint-issue call; no new Jira REST call is required for FR-006.
- **Gaps**: (a) nothing merges sprint window + per-person totals into one payload today — two separate routes; (b) no route exposes per-issue granularity if risk math ever needs it, only the pre-aggregated per-assignee total.

### Calendar data availability

- OAuth scope: `https://www.googleapis.com/auth/calendar.readonly`, requested at `src/pages/api/invite/[token]/start.ts:34` (with `access_type: "offline", prompt: "consent"` to force a refresh token) and re-persisted at `src/pages/api/invite/[token]/callback.ts:49`. Duplicated string literal in both files — not a shared constant. Scope is sufficient for reading events (broader than `calendar.events.readonly` is not needed).
- **No Calendar-events-fetching code exists anywhere** — confirmed by full-repo grep (`calendar.events`, `events.list`, `freebusy`, `calendar/v3`, `googleapis`: zero hits; no `googleapis`/`google-auth-library` dependency installed). S-03's own planning docs explicitly deferred this: `context/archive/2026-07-19-assignee-calendar-invite/plan.md:33` — "No consumption of the stored calendar tokens (fetching actual events) — that's S-04." This is **wholly new work**.
- Established convention to follow for a new Calendar client: raw `fetch` + `AbortSignal.timeout(...)` in a dedicated `src/lib/services/<name>-client.ts`, mirroring `jira-client.ts:104-109` and `src/lib/services/google-revoke.ts:5`. No shared HTTP wrapper exists to extend.
- Token storage: `integration_tokens` table (`supabase/migrations/20260605120000_integration_tokens.sql:3-11`), keyed `(user_id, provider)`, RLS restricts to `auth.uid() = user_id`. Payload type `GoogleCalendarTokenPayload` (`src/types.ts:8-13`): `accessToken`, `refreshToken`, `expiresAt`, `scopes`. AES-256-GCM encryption via `src/lib/crypto/token-encryption.ts:40-76`, same `TOKEN_ENCRYPTION_KEY` reused for Jira PAT and Calendar payloads. Service: `IntegrationTokenService.upsertGoogleCalendarTokens` / `getGoogleCalendarTokens` / `hasToken` (`src/lib/services/integration-token-service.ts:99-152`).
- **No token-refresh mechanism.** `expiresAt` is written from a hardcoded 1-hour guess (`ASSUMED_PROVIDER_TOKEN_TTL_MS`, `callback.ts:11,48` — Google/Supabase doesn't expose the real provider-token expiry) but nothing ever reads it to decide staleness, and nothing exchanges the stored `refreshToken` for a new access token. The only outbound call using the refresh token today is **revocation** (`src/lib/services/google-revoke.ts`, account deletion only), not refresh. This must be built net-new for FR-006 (`expiresAt` check → `POST https://oauth2.googleapis.com/token` with `grant_type=refresh_token` → re-persist via `upsertGoogleCalendarTokens`).
- **No "connected assignees for this sprint" query exists.** Bridge table is `sprint_invites` (`supabase/migrations/20260719154551_sprint_invites.sql:3-15`): `sprint_id`, `jira_account_id`, `connected_user_id` (nullable, set on consume), `status` (`pending`/`consumed`). "Connected" = `status = 'consumed' AND connected_user_id IS NOT NULL` (set in `callback.ts:56` via `SprintInviteService.markConsumed`). `SprintInviteService` (`src/lib/services/sprint-invite-service.ts`) currently only has `createOrGetInvite`, `getInviteByToken`, `markConsumed` — **no `getInvitesBySprintId`-style bulk lookup**. S-04 will need a new method here, then for each `connected_user_id`, call `IntegrationTokenService.getGoogleCalendarTokens(userId)`. Note: reading across the sprint's invites may need the existing admin-client pattern (`src/lib/invite-api-context.ts:10-16`, `resolveInviteAdminService()`) since `sprint_invites` RLS restricts to `auth.uid() = invited_by` — check `src/lib/service-role-boundary.test.ts` guardrail before adding a new admin-client call site.
- `SprintAssignee` (`src/types.ts:51-55`) has no email field — Jira-account-to-Supabase-user correlation runs only through the invite-token flow, not email matching.

### Risk computation precedent

- **No risk/threshold/band/context-switch/workload logic or types exist in `src/` at all** — confirmed by full-repo grep; only two UI-copy string hits (`SprintPicker.tsx:119`, `invite/[token].astro:50`), neither is computation. `src/types.ts` has no `RiskBand`, no meeting-hours or context-switch fields anywhere.
- PRD (`context/foundation/prd.md`) defines the algorithm's _shape_, not its numbers: workload (story points) + meeting hours + context switches (counted per work↔meeting transition) → qualitative band (Low/Medium/High/Critical), never a numeric score shown to the user (`prd.md:61`, `104-106`). No definition of "meeting" vs "focused work" beyond "calendar events with timestamps/durations" (focused work is implicitly "everything else"), no timezone rule, no partial-day-sprint rule.
- `context/foundation/test-plan.md:45,57,310-312` independently flags risk-band correctness as a top test risk and explicitly defers "band boundary fixtures from requirements" as TBD, warning against "copying production threshold code into test expected value" — confirms the test-planning layer also treats thresholds as undecided, not merely undocumented.
- No prior change (`context/archive/2026-06-14-jira-sprint-picker/plan.md:32,41`, `context/archive/2026-07-19-assignee-calendar-invite/plan-brief.md:8,41`, `plan.md:33`) contains a formula or numeric threshold — only deferral notes ("that's S-04") and one data-shape note (server-side per-assignee aggregation "prepares data shape for S-04").
- **Non-canonical but relevant**: `context/domain/01-domain-distillation.md`, `02-invariant-aggregate-refactor.md`, `architect-report.md` (dated 2026-07-11/12) are exploratory DDD design docs framed as a course exercise ("10xArchitect Module 4," explicitly "no production code written") — not part of the official change/archive chain. They sketch illustrative types (`SprintRiskAssessment`, `AssigneeRiskRow`, `RiskBand`, `Workload`, `MeetingLoad`) and invariants I-1 through I-9 (e.g., risk always derived from the full triad never workload alone; band is qualitative-only, never numeric; events counted only within `[start, end]`; a switch counted per work↔meeting transition). Even here, the risk-mapping function stops at a named, unimplemented signature (`RiskBand.fromTriad(...)` — `02-invariant-aggregate-refactor.md:375`) with no formula, weights, or worked example. Worth a skim for vocabulary/invariant ideas during planning, but carries no authority and should not be treated as a decided design.
- **Verdict**: risk-band threshold tuning is genuinely undecided anywhere in code or docs — matches the open unknown already flagged in `change.md:19-20` and `roadmap.md:116`.

## Code References

- `src/lib/services/jira-client.ts:233-241` — `listBoards`
- `src/lib/services/jira-client.ts:243-257` — `listActiveFutureSprints` (sprint window: `startDate`/`endDate`)
- `src/lib/services/jira-client.ts:210-227` — `listSprintIssues` (per-issue story points, internal only)
- `src/lib/services/jira-client.ts:259-284` — `getSprintAssignees` (per-assignee aggregation)
- `src/lib/services/jira-client.ts:39-47` — `readStoryPoints()` field resolution (`storyPoints` / `customfield_10016`)
- `src/types.ts:37-55` — `JiraBoard`, `JiraSprint`, `SprintAssignee` types
- `src/pages/api/jira/boards/[boardId]/sprints.ts` — exposes sprint window
- `src/pages/api/jira/sprints/[sprintId]/assignees.ts` — exposes per-assignee totals
- `src/pages/api/invite/[token]/start.ts:34` — Calendar OAuth scope request
- `src/pages/api/invite/[token]/callback.ts:11,47-49,56` — token persistence, assumed TTL, `markConsumed`
- `src/lib/services/integration-token-service.ts:99-152` — Calendar token upsert/get/hasToken
- `src/lib/crypto/token-encryption.ts:40-76` — AES-256-GCM encryption
- `src/lib/services/sprint-invite-service.ts` — `createOrGetInvite`, `getInviteByToken`, `markConsumed` (no bulk-by-sprint lookup yet)
- `src/lib/services/google-revoke.ts` — only existing outbound call using the refresh token (revocation, not refresh)
- `src/lib/invite-api-context.ts:10-16` — `resolveInviteAdminService()` admin-client pattern
- `supabase/migrations/20260605120000_integration_tokens.sql` — `integration_tokens` schema + RLS
- `supabase/migrations/20260719154551_sprint_invites.sql` — `sprint_invites` schema + RLS

## Architecture Insights

- Service convention: each external API gets its own `src/lib/services/<name>-client.ts` using raw `fetch` + `AbortSignal.timeout`, no shared HTTP wrapper — a new Google Calendar client should follow the same shape as `jira-client.ts` and `google-revoke.ts`.
- Token storage/encryption layer is already generic across providers (`provider` column, shared `TOKEN_ENCRYPTION_KEY`) — a Calendar-events service only needs to consume `getGoogleCalendarTokens`, not touch encryption.
- Admin-client access is gated by an explicit guardrail test (`service-role-boundary.test.ts`) — any new cross-user query (e.g., bulk sprint-invite lookup) needs to go through the existing `resolveInviteAdminService()` pattern rather than a fresh service-role client.
- Aggregation-at-the-service-layer is an established pattern (`getSprintAssignees` aggregates in `jira-client.ts`, not in the route or client) — a risk-computation service should likely follow the same layering: raw data fetch → aggregation/scoring service → thin route.

## Historical Context (from prior changes)

- `context/archive/2026-06-14-jira-sprint-picker/plan.md:41` — server-side per-assignee story-point aggregation was deliberately built to "prepare data shape for S-04," confirming `getSprintAssignees`'s output shape is intentional prep work, not incidental.
- `context/archive/2026-07-19-assignee-calendar-invite/plan.md:33` and `plan-brief.md:41` — S-03 explicitly scoped out "actually reading calendar events," confirming that work is 100% S-04's to build.
- `context/foundation/test-plan.md:45,57` — risk-band misrepresentation is already flagged as the top test risk for this slice, with band-boundary fixtures explicitly marked TBD pending requirements from S-04 planning.

## Related Research

- No prior `context/changes/**/research.md` or `context/archive/**/research.md` covers risk computation directly — this is the first research pass on S-04.
- `context/domain/01-domain-distillation.md`, `02-invariant-aggregate-refactor.md`, `architect-report.md` — non-canonical exploratory DDD sketches (course exercise), useful only as optional vocabulary/invariant input, not a decided design.

## Open Questions

- Risk-band threshold tuning (workload + meeting hours + context switches → Low/Medium/High/Critical) — no formula exists anywhere; needs to be designed during `/10x-plan` (owner: user, per `change.md`).
- Long-running analysis UX (NFR: visible progress if operation exceeds two seconds) — out of scope for this research pass per user's stated focus; existing `SprintPicker` full-page spinner (`src/components/dashboard/SprintPicker.tsx`) is the nearest precedent if revisited later.
- Whether the merged "sprint window + per-person story points" payload and the new "connected assignees + calendar tokens" lookup should be combined into one new service/route, or composed from the existing pieces at plan time.
- Whether per-issue story-point granularity is ever needed by the risk formula, or whether the existing per-assignee total (`getSprintAssignees`) is sufficient.
