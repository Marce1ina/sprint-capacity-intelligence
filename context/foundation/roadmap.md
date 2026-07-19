---
project: "Sprint Capacity Intelligence"
version: 1
status: active
created: 2026-06-05
updated: 2026-07-19
prd_version: 1
main_goal: market-feedback
top_blocker: time
---

# Roadmap: Sprint Capacity Intelligence

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Accepted 2026-06-05. Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Engineering Managers commit to sprint scope without knowing whether the team has enough uninterrupted focus time to deliver. Story points measure workload volume, not how much attention capacity remains once meetings and context switching are accounted for. This product gives EMs a pre-sprint signal that combines Jira sprint scope with assignee calendar reality.

## North star

**S-04: Per-person sprint risk table** — the smallest end-to-end flow that proves EMs get a useful pre-sprint overload signal from real Jira and calendar data, sequenced as early as prerequisites allow because everything else only matters if this works.

> **North star** here means the first slice whose successful delivery would prove the core product hypothesis — not the largest possible MVP.

## At a glance

| ID   | Change ID                   | Outcome (user can …)                                                                                                                         | Prerequisites | PRD refs                       | Status   |
| ---- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------ | -------- |
| F-01 | integration-token-store     | (foundation) persist Jira PAT and calendar OAuth tokens securely                                                                             | —             | Access Control, NFR guardrails | done     |
| S-01 | google-auth-jira-onboarding | sign in with Google and configure Jira PAT during onboarding                                                                                 | F-01          | FR-001, FR-002                 | done     |
| S-02 | jira-sprint-picker          | select a sprint from Jira and see its assignees                                                                                              | S-01          | FR-003                         | done     |
| S-03 | assignee-calendar-invite    | invite sprint assignees to connect Google Calendar; assignee connects via invite link                                                        | S-02          | FR-004, FR-005                 | done     |
| S-04 | sprint-risk-table           | view a per-person risk table for the selected sprint (story points, meeting hours, context switches, risk level) for each connected assignee | S-02, S-03    | US-01, FR-006, FR-007          | proposed |
| S-05 | delete-user-account         | permanently delete their account and all associated stored data (integration tokens, profile)                                                | S-01          | Access Control, NFR guardrails | done     |

## Baseline

What's already in place in the codebase as of `2026-07-19` (F-01 through S-03 done; only S-04 remains).

- **Frontend:** present — Astro 6 SSR + React 19 islands; file-based routing in `src/pages/`; shadcn/ui scaffold; sprint picker + assignee invite UI landed.
- **Backend / API:** present — Astro SSR + Cloudflare adapter; `src/middleware.ts`; auth routes; Jira boards/sprints/assignees routes; invite generation + calendar connect routes.
- **Data:** present — Supabase schema with `integration_tokens` (Jira PAT, calendar OAuth), invite records; migrations in `supabase/migrations/`.
- **Auth:** present — Supabase email/password + Google OAuth (PKCE) wired end-to-end; per-assignee Google Calendar OAuth via invite link.
- **Deploy / infra:** partial — production Worker live (`sprint-capacity-intelligence.marcelina-kucieba.workers.dev`); `wrangler.jsonc` aligned + SESSION KV pinned; Cloudflare Workers Builds connected and auto-deploy verified manually; GitHub Actions lint+build only — deploy job not implemented (intended future target per `tech-stack.md` `ci_default_flow: auto-deploy-on-merge`).
- **Observability:** partial — Cloudflare Workers observability flag in `wrangler.jsonc` only; no app-level logging, error tracking, or metrics.

## Foundations

### F-01: Integration token store

- **Outcome:** (foundation) minimal schema and secure persistence for Jira PAT and calendar OAuth tokens landed; tokens not exposed in UI or logs.
- **Change ID:** integration-token-store
- **PRD refs:** Access Control (Jira PAT, calendar tokens), NFR guardrails (secure storage, data minimization)
- **Unlocks:** S-01 (Jira PAT onboarding), S-03 (calendar token storage), S-04 (risk computation inputs)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Data layer is absent today; without token persistence, onboarding and calendar connect cannot be planned safely — sequenced first to unblock the must-have path under time pressure without building a full data platform.
- **Status:** done

## Slices

### S-01: Google sign-in and Jira PAT onboarding

- **Outcome:** user can sign in with Google and configure Jira access with a Personal Access Token during onboarding.
- **Change ID:** google-auth-jira-onboarding
- **PRD refs:** FR-001, FR-002
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Google OAuth provider configuration in Supabase — Owner: user. Block: no.
- **Risk:** Baseline auth is email/password only; Google OAuth is net-new work on the critical path — done early because FR-001 gates every downstream slice and calendar access depends on Google identity.
- **Status:** done

### S-02: Jira sprint picker

- **Outcome:** user can select a sprint from Jira and see the sprint's assignees for capacity analysis.
- **Change ID:** jira-sprint-picker
- **PRD refs:** FR-003
- **Prerequisites:** S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Jira API shape for sprint window and assignee story points — Owner: user. Block: no.
- **Risk:** First server-side Jira integration; validates PAT storage and API access before calendar and risk work — failure here blocks the north star without wasting calendar effort.
- **Status:** done

### S-03: Assignee calendar connect via invite

- **Outcome:** user can invite sprint assignees to connect their Google Calendar; assignee can connect via invite link (partial results OK — unconnected assignees omitted from output).
- **Change ID:** assignee-calendar-invite
- **PRD refs:** FR-004, FR-005
- **Prerequisites:** S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - ~~Invite link mechanism without groups UX~~ — resolved: shareable link, EM copies manually, no email delivery.
  - ~~Per-user OAuth vs EM delegated calendar read~~ — resolved: per-user OAuth (assignee completes Google consent, tokens stored against their own account).
- **Risk:** Two Open Questions remained at planning time; both resolved during implementation per the PRD's committed invite/link + per-user OAuth path — S-04 now unblocked.
- **Status:** done

### S-04: Per-person sprint risk table

- **Outcome:** user can view a per-person risk table for the selected sprint showing story points, meeting hours, context switches, and qualitative risk level (Low / Medium / High / Critical) for each connected assignee.
- **Change ID:** sprint-risk-table
- **PRD refs:** US-01, FR-006, FR-007
- **Prerequisites:** S-02, S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Risk band threshold tuning (qualitative mapping from workload + meetings + context switches) — Owner: user. Block: no.
  - Long-running analysis UX (NFR: visible progress when operation exceeds two seconds) — Owner: user. Block: no.
- **Risk:** North star slice — proves the core hypothesis end-to-end. Both prerequisites (S-02, S-03) are done — nothing left blocking this slice.
- **Status:** proposed

### S-05: EM account deletion

- **Outcome:** EM can permanently delete their account and all associated stored data (integration tokens, profile).
- **Change ID:** delete-user-account
- **PRD refs:** Access Control, NFR guardrails (data minimization)
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Stored PATs and calendar tokens create a data-retention obligation — off the north-star path but needed for trustworthy handling of user data.
- **Status:** done

## Backlog Handoff

| Roadmap ID | Change ID                   | Suggested issue title                                        | Ready for `/10x-plan` | Notes                                   | GitHub Issue                                                             |
| ---------- | --------------------------- | ------------------------------------------------------------ | --------------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| F-01       | integration-token-store     | Add secure token persistence for Jira PAT and calendar OAuth | yes                   | Run `/10x-plan integration-token-store` | [#1](https://github.com/Marce1ina/sprint-capacity-intelligence/issues/1) |
| S-01       | google-auth-jira-onboarding | Google sign-in and Jira PAT onboarding                       | no                    | After F-01                              | [#2](https://github.com/Marce1ina/sprint-capacity-intelligence/issues/2) |
| S-02       | jira-sprint-picker          | Select sprint from Jira and list assignees                   | no                    | After S-01                              | [#3](https://github.com/Marce1ina/sprint-capacity-intelligence/issues/3) |
| S-03       | assignee-calendar-invite    | Invite assignees and connect Google Calendar via link        | no                    | After S-02                              | [#4](https://github.com/Marce1ina/sprint-capacity-intelligence/issues/4) |
| S-04       | sprint-risk-table           | Per-person sprint risk table (north star)                    | no                    | After S-02 + S-03                       | [#5](https://github.com/Marce1ina/sprint-capacity-intelligence/issues/5) |
| S-05       | delete-user-account         | EM account deletion and data purge                           | no                    | After S-01; parallel with S-02–S-04     | —                                                                        |

## Open Roadmap Questions

Both resolved during S-03 implementation:

1. ~~**How does the app obtain each assignee's calendar events?**~~ — Resolved: per-user OAuth. Assignee completes Google consent (calendar read-only, offline access) via their invite link; tokens stored against their own Supabase account.
2. ~~**How are assignees invited to connect without groups UX?**~~ — Resolved: shareable invite link, EM copies manually from the assignee table. No email delivery, no groups UX.

## Parked

- **GitHub Actions deploy job** — Why parked: time blocker + live Worker and Cloudflare Workers Builds already deliver; `tech-stack.md` targets `auto-deploy-on-merge` via GitHub Actions but defer until after north star slice lands.
- **No sprint execution tracking or real-time updates** — PRD §Non-Goals.
- **No Slack or GitHub integrations** — PRD §Non-Goals.
- **No groups creation/moderation UI** — PRD §Non-Goals; assignee invite/link replaces for v1.
- **No AI summary layer** — PRD §Non-Goals.
- **No team weekly risk visualization** — PRD §Non-Goals.

## Done

- **S-03: user can invite sprint assignees to connect their Google Calendar; assignee can connect via invite link (partial results OK — unconnected assignees omitted from output).** — Archived 2026-07-19 → `context/archive/2026-07-19-assignee-calendar-invite/`. Lesson: —.
- **F-01: (foundation) minimal schema and secure persistence for Jira PAT and calendar OAuth tokens landed; tokens not exposed in UI or logs.** — Archived 2026-06-14 → `context/archive/2026-06-05-integration-token-store/`. Lesson: —.
- **S-01: user can sign in with Google and configure Jira access with a Personal Access Token during onboarding.** — Archived 2026-06-14 → `context/archive/2026-06-13-google-auth-jira-onboarding/`. Lesson: —.
- **S-02: user can select a sprint from Jira and see the sprint's assignees for capacity analysis.** — Archived 2026-06-14 → `context/archive/2026-06-14-jira-sprint-picker/`. Lesson: —.
- **S-05: EM can permanently delete their account and all associated stored data (integration tokens, profile).** — Archived 2026-06-14 → `context/archive/2026-06-14-delete-user-account/`. Lesson: —.
