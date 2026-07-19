# Per-Person Sprint Risk Table — Plan Brief

> Full plan: `context/changes/sprint-risk-table/plan.md`
> Research: `context/changes/sprint-risk-table/research.md`

## What & Why

Build S-04, the product's north-star slice: a per-person sprint risk table (story points, meeting hours, context switches, qualitative risk band) for every assignee who has connected their Google Calendar. This is the first slice that actually combines Jira workload with calendar reality — everything before it (S-01 through S-03) was plumbing to make this possible.

## Starting Point

Jira workload data is ready (`getSprintAssignees` already aggregates per-assignee story points). Calendar OAuth tokens are stored (S-03) but nothing reads them yet — no Calendar-events fetch, no token refresh, and no query joins "this sprint's assignees" to "which have connected." Risk computation itself is a blank slate: no thresholds, weights, or types exist anywhere.

## Desired End State

An EM selects a sprint on the dashboard and sees a risk table appear below the existing assignee list — one row per connected assignee, with story points, meeting hours, context switches, and a Low/Medium/High/Critical band. Assignees who haven't connected are omitted; assignees whose connection has gone stale (expired token) or whose Calendar fetch failed show a visible distinct state instead of silently disappearing.

## Key Decisions Made

| Decision                | Choice                                                                                                                        | Why (1 sentence)                                                                                                                                  | Source |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Risk combination        | Rule-based: count signals at High/Critical (0→Low, 1→Medium, 2→High, 3→Critical)                                              | Matches PRD's "qualitative only" framing and guarantees no single signal alone forces Critical                                                    | Plan   |
| Workload thresholds     | Fixed absolute story-point bands (≤5/6-10/11-15/≥16)                                                                          | Simplicity over sprint-length normalization                                                                                                       | Plan   |
| Meeting-hours source    | Unfiltered `events.list` (no attendee/RSVP filtering); all-day events excluded from hour/switch math                          | Simplicity for filtering choice; all-day exclusion is a data-shape necessity, not a policy                                                        | Plan   |
| Context switches        | Strict zero-tolerance transition counting                                                                                     | Matches PRD's literal "transition between focused work and meeting" wording                                                                       | Plan   |
| Token refresh           | Not built this slice — expired token shows "reconnect required" row                                                           | Keeps scope to the table itself; refresh is real but separable future work                                                                        | Plan   |
| Partial-failure UX      | Visible error/reconnect row states, never silent omission                                                                     | test-plan.md's top risk explicitly flags silent-drop as the failure mode to avoid                                                                 | Plan   |
| Architecture            | One new merged risk-computation service + one new route                                                                       | Matches existing aggregation-at-service-layer convention                                                                                          | Plan   |
| Progress UX             | Reuse existing full-page spinner (single request/response)                                                                    | Satisfies the >2s NFR without new streaming/job infra                                                                                             | Plan   |
| Test fixtures           | Hand-authored PRD-scenario fixtures, no separate invariant suite                                                              | Avoids the oracle problem test-plan.md flags, keeps scope tight                                                                                   | Plan   |
| Cross-user token access | `IntegrationTokenService` constructed with admin client for this one call site; guardrail test allowlist widened, not deleted | Least new code; the invariant "never construct with admin client" is loosened project-wide by this, not just for this file — a conscious tradeoff | Plan   |

## Scope

**In scope:** risk-scoring logic, Google Calendar client, cross-user token lookup for connected assignees, merged risk API route, UI table with reconnect/error row states.

**Out of scope:** token refresh, per-issue story-point detail, EM-delegated calendar read, streaming/incremental progress UI, caching/persisting computed risk, team-level views.

## Architecture / Approach

`jira-client.ts` (workload + sprint window) + new `google-calendar-client.ts` (events → meeting hours/switches) + `sprint-invite-service.ts` (connected-assignee lookup, EM-scoped) feed into a new `risk-computation-service.ts`, which is also the one place allowed to read another user's Calendar token via an admin Supabase client. A thin new route exposes it; a new React island renders it below the existing assignee table.

## Phases at a Glance

| Phase                       | What it delivers                                                        | Key risk                                                                                 |
| --------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1. Risk computation core    | Pure, tested risk-scoring logic (types + thresholds + combination rule) | Thresholds are provisional guesses — isolated in one constants module for easy retuning  |
| 2. Google Calendar client   | Events fetch + meeting-hours/switch derivation                          | All-day/pagination/timeout edge cases are easy to get subtly wrong                       |
| 3. Cross-user data assembly | Orchestration service joining Jira + invites + tokens                   | Touches the service-role guardrail test — the riskiest, most reviewed change in the plan |
| 4. API route                | `GET /api/jira/sprints/[sprintId]/risk`                                 | Must never leak decrypted tokens in the response                                         |
| 5. UI: SprintRiskTable      | Table + hook wired into the dashboard                                   | Row-state UX (ok/reconnect/error) needs to read clearly, not just technically exist      |
| 6. Testing + readiness      | Full coverage, confirm no new migrations/secrets                        | Fixture design must resist copying prod thresholds (oracle problem)                      |

**Prerequisites:** S-02 and S-03 (both done, confirmed in `roadmap.md`).
**Estimated effort:** ~4-6 sessions across 6 phases — Phase 3 (guardrail change + cross-user orchestration) is the highest-risk, most review-worthy phase.

## Open Risks & Assumptions

- Threshold numbers (workload/meeting-hours/context-switch bands) are reasoned defaults, not calibrated against real usage — expect retuning after the first few real sprints.
- Widening the service-role guardrail test is a real, if narrow, loosening of a security invariant — flagged explicitly for review at Phase 3, not silently absorbed into "just code."
- Sequential per-assignee Calendar fetching may make the >2s NFR harder to hit as connected-assignee count grows; parallelizing is a known future lever, not built now.

## Success Criteria (Summary)

- EM sees a correct risk table for any sprint with ≥1 connected assignee, with no assignee silently dropped due to a token/fetch problem.
- No PAT, access token, or refresh token ever appears in any API response.
- Full test suite, typecheck, lint, and build all pass; no new Supabase migration or secret is required.
