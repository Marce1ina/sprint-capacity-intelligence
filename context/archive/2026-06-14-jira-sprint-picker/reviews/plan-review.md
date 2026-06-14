<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Jira Sprint Picker Implementation Plan

- **Plan**: `context/changes/jira-sprint-picker/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-14
- **Verdict**: SOUND (after triage)
- **Findings**: 1 critical, 3 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 5/5 paths ✓, 5/5 symbols ✓, brief↔plan ✓

Verified paths: `jira-client.ts`, `jira-site-url.ts`, `types.ts`, `dashboard.astro`, `integration-token-service.ts`. Symbols: `assertAllowedJiraSiteUrl`, `validateJiraCredentials`, `getJiraPat`, `JiraValidationError`, `buildBasicAuthHeader`. Brief phases, decisions, and scope match plan.

## Findings

### F1 — storyPoints field name is not portable

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase 1 — `getSprintAssignees`; Critical Implementation Details
- **Detail**: Plan hardcodes `fields=assignee,storyPoints` and reads `fields.storyPoints`. Jira Cloud stores story points as instance-specific `customfield_*` IDs (board configuration exposes `estimation.field.fieldId`). The `storyPoints` alias is undocumented and board-dependent — totals may silently show 0, failing FR-003's core value. Plan defers "custom field discovery in onboarding" but still assumes a portable field name at runtime.
- **Fix A ⭐ Recommended**: Pass `boardId` through assignees flow; resolve estimation `fieldId` via `GET /rest/agile/1.0/board/{boardId}/configuration`; request that field in sprint issue queries.
  - Strength: Works across scrum boards without onboarding changes; aligns with Jira's documented board-config path.
  - Tradeoff: Assignees endpoint gains `boardId` param; one extra Jira call per sprint load.
  - Confidence: HIGH — Atlassian docs point to board configuration for estimation field ID.
  - Blind spot: Kanban boards without estimation config need explicit fallback (0 points).
- **Fix B**: Keep `storyPoints` alias; make Phase 1 manual spike mandatory against real Jira before Phase 2.
  - Strength: Minimal code change if alias works on target instances.
  - Tradeoff: May ship broken for EMs on non-default field configs; spike becomes gate, not optional.
  - Confidence: MEDIUM — alias works on some default scrum sites, not verified in this repo.
  - Blind spot: Production boards with renamed/reconfigured estimation fields.
- **Decision**: FIXED via Fix B

### F2 — Sprint issue pagination response shape differs from boards

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — `getSprintAssignees` contract
- **Detail**: Plan paginates boards and sprint issues with the same `startAt`/`maxResults`/`isLast` loop, but the sprint issue endpoint returns `{ isLast, issues: [...] }` — not `values[]` like the board and board-sprint endpoints. Copying the board pagination helper verbatim will fail at runtime.
- **Fix**: Document in Phase 1 contract that sprint issues use `issues[]` as the collection key; implement a separate pagination branch or parameterize the collection key.
- **Decision**: FIXED via Fix in plan

### F3 — Sprint list endpoint lacks pagination

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — `listActiveFutureSprints`
- **Detail**: `listBoards` paginates with `startAt`/`maxResults` until `isLast`, but `listActiveFutureSprints` makes a single request with no pagination loop. Boards with many sprints (including closed ones filtered server-side) may truncate active/future results when `maxResults` is exceeded.
- **Fix**: Add the same pagination loop to `listActiveFutureSprints` as `listBoards`, using `values[]` and `isLast` from `GET /rest/agile/1.0/board/{boardId}/sprint?state=active,future`.
- **Decision**: FIXED via Fix in plan

### F4 — Missing explicit null-token / missing-siteUrl API contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — JSON API Routes; shared route helper
- **Detail**: `IntegrationTokenService.getJiraPat()` can return `null`; `JiraTokenPayload.siteUrl` is optional in `src/types.ts` and legacy rows may store `{ pat }` only. Middleware gates `/dashboard` and `/onboarding` but not `/api/jira/*` — authenticated users without a stored token can reach new endpoints. Plan implies auth + token loading but does not specify HTTP status or message when token or `siteUrl` is missing.
- **Fix**: In Phase 2 shared helper contract, return `403` JSON `{ error: "..." }` when `getJiraPat()` is null; return `400` with safe message when `siteUrl` is missing; require normalized `siteUrl` before any outbound Jira fetch (same as onboarding).
- **Decision**: FIXED via Fix in plan
