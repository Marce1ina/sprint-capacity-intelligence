<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Jira Sprint Picker Implementation Plan

- **Plan**: context/changes/jira-sprint-picker/plan.md
- **Scope**: All 4 phases (complete)
- **Date**: 2026-06-14
- **Verdict**: APPROVED (post-triage)
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Automated Verification

| Command         | Result | Notes                          |
| --------------- | ------ | ------------------------------ |
| `npm run lint`  | PASS   | Exit 0                         |
| `npm run build` | PASS   | Exit 0 (server build complete) |

## Findings

### F1 — Unbounded Jira pagination loops

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/jira-client.ts:143-152, 167-181
- **Detail**: `paginateValues` and `paginateSprintIssues` loop until `isLast` with no max-page guard. A malformed Jira response or very large collection could exhaust Worker time or issue many sequential 10s-cap requests.
- **Fix**: Add a `MAX_PAGES` (or max-items) cap; throw `JiraValidationError` with a safe user message when exceeded.
  - Strength: Matches defensive patterns for external API pagination; bounds worst-case runtime.
  - Tradeoff: Very large boards/sprints may fail with a user-visible error instead of completing.
  - Confidence: HIGH — standard guard for unbounded loops against third-party APIs.
  - Blind spot: Actual max sprint size on target Jira instance not measured in review.
- **Decision**: FIXED — added MAX_PAGES (50) guard in paginateValues and paginateSprintIssues

### F2 — Stale fetch race on rapid board/sprint changes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/use-jira-sprint-picker.ts:71-143
- **Detail**: `loadSprints` and `loadAssignees` have no request-generation guard or `AbortController`. Rapid selection changes can let an older in-flight response overwrite newer state (wrong sprint assignees shown briefly or until next action).
- **Fix**: Track a monotonic request ID (or abort prior fetch) per load function; ignore responses that don't match the current selection.
  - Strength: Eliminates a class of UI state corruption common in chained async fetches.
  - Tradeoff: Small hook complexity increase.
  - Confidence: HIGH — well-established pattern for React fetch orchestration.
  - Blind spot: Repro requires fast manual clicking; not observed in plan manual tests.
- **Decision**: FIXED — request-generation refs on loadSprints/loadAssignees; invalidated on selection change

### F3 — Story points rely on instance-specific field fallback

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/jira-client.ts:14-16, 38-45
- **Detail**: Plan specified `fields.storyPoints` alias only, with spike gate before Phase 2. Implementation adds hardcoded `customfield_10016` fallback after a successful spike on one instance. Other Jira configs may silently show zero points — core feature failure without error.
- **Fix A ⭐ Recommended**: Document the drift in plan as spike addendum; defer dynamic field resolution to S-03/S-04 follow-up as plan already anticipates.
  - Strength: Preserves working implementation for validated instance; aligns source of truth with reality.
  - Tradeoff: Other Jira sites remain unsupported until field discovery ships.
  - Confidence: HIGH — plan explicitly deferred board-configuration field resolution.
  - Blind spot: No multi-instance validation performed.
- **Fix B**: Remove `customfield_10016` fallback; rely on alias only per original contract.
  - Strength: Strict plan adherence; failures surface loudly.
  - Tradeoff: May break the instance where spike succeeded if alias alone is insufficient.
  - Confidence: MEDIUM — spike output not re-run during review.
  - Blind spot: Which field actually returned non-zero in spike.
- **Decision**: FIXED via Fix A — plan addendum documents story-point field fallback; dynamic resolution deferred to S-03/S-04

### F4 — Duplicate `parsePositiveInt` in route handlers

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/jira/boards/[boardId]/sprints.ts, src/pages/api/jira/sprints/[sprintId]/assignees.ts
- **Detail**: Identical positive-integer parsing logic duplicated in both dynamic Jira routes.
- **Fix**: Extract to a shared util (e.g. `src/lib/parse-route-id.ts`) and import in both routes.
- **Decision**: FIXED — extracted `parsePositiveInt` to `src/lib/parse-route-id.ts`

### F5 — No empty-state copy when boards or sprints list is empty

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/dashboard/SprintPicker.tsx:73, 116-121
- **Detail**: Sprint select is disabled when `sprints.length === 0`, indistinguishable from loading. Assignee table has an empty message; boards/sprints do not.
- **Fix**: After load completes with zero results, show explicit copy (e.g. "No active or future sprints on this board").
- **Decision**: FIXED — empty-state copy for zero boards and zero sprints after load completes

## Plan Drift Summary (no separate findings — all minor)

| Item                                    | Verdict | Notes                                          |
| --------------------------------------- | ------- | ---------------------------------------------- |
| Phase 1 types + client methods          | MATCH   | All planned methods present                    |
| Phase 1 spike script                    | MATCH   | `scripts/spike-jira-sprint-assignees.mts`      |
| Phase 2 API routes + context helper     | MATCH   | Auth/token/error contracts implemented         |
| Phase 3 UI (hook, SprintPicker, shadcn) | MATCH   | Full contract met                              |
| Phase 4 docs                            | MATCH   | README + AGENTS updated                        |
| Story-point field fallback              | DRIFT   | Spike-driven; see F3                           |
| Jira HTTP errors → API 400              | DRIFT   | Safe JSON; status not mirrored (acceptable)    |
| Select alignment fix in SprintPicker    | DRIFT   | Fix in consumer, not base select.tsx           |
| Scope guardrails                        | MATCH   | No persistence, writes, tests, or service-role |

## Positive Highlights

- SSRF guard on every outbound Jira call via `assertAllowedJiraSiteUrl`.
- PAT never returned in JSON responses; server-side Basic auth only.
- All three routes use `prerender = false`, uppercase `GET`, and shared `resolveJiraApiContext`.
- React hook in `src/components/hooks/`; no `"use client"` directive.
- Production smoke checklist documented and marked complete in plan Progress.

## Triage Summary (2026-06-14)

| Finding | Decision                                                 |
| ------- | -------------------------------------------------------- |
| F1      | FIXED — MAX_PAGES (50) pagination guard                  |
| F2      | FIXED — request-generation refs in hook                  |
| F3      | FIXED via Fix A — plan addendum for story-point fallback |
| F4      | FIXED — shared `parsePositiveInt` util                   |
| F5      | FIXED — empty-state copy in SprintPicker                 |

All 5 findings fixed. Lint passes after changes.
