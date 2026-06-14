# Jira Sprint Picker — Plan Brief

> Full plan: `context/changes/jira-sprint-picker/plan.md`

## What & Why

S-02 delivers FR-003: an authenticated EM selects a sprint from their Jira site and sees who is assigned with total story points. This is the first real Jira read integration — it validates stored PAT credentials and Agile API access before calendar connect (S-03) and the north-star risk table (S-04).

## Starting Point

S-01 landed Google OAuth, encrypted `{ pat, siteUrl }` in `integration_tokens`, and a minimal `jira-client.ts` that validates via `GET /rest/api/3/myself` only. `getJiraPat()` exists but is unused. `/dashboard` is a static welcome placeholder with no React islands or JSON API routes.

## Desired End State

On `/dashboard`, the EM picks a Jira board, then an active or future sprint, and sees a table of assignees with summed story points for that sprint. Jira errors surface as a safe banner with retry. Selection lives in React state for the session (no DB persistence). All Jira calls are server-side using Basic auth (`email:pat`).

## Key Decisions Made

| Decision           | Choice                               | Why (1 sentence)                                                         | Source |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------------ | ------ |
| Board discovery    | Board picker → sprint picker         | Supports multi-board EMs without wrong-board assumptions                 | Plan   |
| Sprint scope       | Active + future only                 | Matches pre-sprint planning workflow; excludes closed sprints            | Plan   |
| Sprint persistence | Ephemeral React state                | Fastest to ship; S-03/S-04 add persistence or pass selection when needed | Plan   |
| Assignee display   | Name + total story points            | Direct preview of workload distribution before S-04 risk table           | Plan   |
| Story points field | Default `storyPoints` from Agile API | Standard Jira Software field; custom mapping deferred                    | Plan   |
| API shape          | Three granular JSON endpoints        | Clear contracts, incremental loading, easy to extend                     | Plan   |
| Loading UX         | Full-page spinner during fetches     | Minimal implementation for MVP dashboard                                 | Plan   |
| Error recovery     | ServerError banner + retry           | Consistent with S-01 safe-message pattern without disruptive redirects   | Plan   |
| Phase structure    | Client → API → UI → prod checklist   | Backend contracts before UI wiring; smoke last                           | Plan   |

## Scope

**In scope:** Extend `jira-client.ts` with Agile REST helpers; DTO types; `GET /api/jira/boards`, `/api/jira/boards/:boardId/sprints`, `/api/jira/sprints/:sprintId/assignees`; dashboard React island with board/sprint selects and assignee table; shadcn components as needed; production smoke checklist.

**Out of scope:** Sprint selection DB persistence; calendar connect (S-03); risk computation/table (S-04); closed sprints; custom story-point field mapping; board config in onboarding; automated tests; Jira write operations.

## Architecture / Approach

Dashboard React island fetches three JSON endpoints. Each route resolves the Supabase user, loads decrypted Jira credentials via `IntegrationTokenService.getJiraPat()`, and calls shared `jira-client` helpers against Jira Agile REST (`/rest/agile/1.0/...`). Assignee aggregation (sum story points per person) happens server-side in the assignees endpoint.

```
Dashboard (React) → /api/jira/boards → Jira GET /rest/agile/1.0/board
                 → /api/jira/boards/:id/sprints → Jira GET .../board/:id/sprint?state=active,future
                 → /api/jira/sprints/:id/assignees → Jira GET .../sprint/:id/issue → aggregate
```

## Phases at a Glance

| Phase                   | What it delivers                                      | Key risk                                          |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| 1. Jira client & types  | Shared fetch helper, DTOs, board/sprint/assignee APIs | `storyPoints` field absent on non-Scrum boards    |
| 2. JSON API routes      | Three authenticated endpoints with safe error JSON    | First JSON API pattern; dynamic route file layout |
| 3. Dashboard UI         | Board/sprint picker + assignee table + loading/errors | Full-page spinner blocks interaction during loads |
| 4. Production readiness | Hosted smoke checklist per lessons.md                 | Prod Jira PAT permissions differ from local       |

**Prerequisites:** S-01 complete; EM has valid Jira PAT + site URL stored; Jira site has at least one scrum/kanban board with active or future sprints.

**Estimated effort:** ~2–3 focused sessions across 4 phases.

## Open Risks & Assumptions

- Ephemeral sprint selection means S-03/S-04 must re-prompt or add persistence — accepted tradeoff for faster S-02 ship.
- `storyPoints` may be null/missing on some issues or boards — treat as 0; no custom-field discovery in this slice.
- PAT must have browse permission for boards/sprints/issues; 403 mapped to safe user message.
- Unassigned issues appear as a single "Unassigned" row with summed points (not hidden).
- No new Supabase migration required unless persistence is added later.

## Success Criteria (Summary)

- EM on `/dashboard` selects board → sprint → sees assignee names with story point totals.
- Invalid/expired Jira credentials show a safe error with retry, not raw API details.
- Lint and build pass; manual smoke against real Jira site confirms end-to-end flow.
