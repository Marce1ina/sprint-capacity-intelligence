---
project: "Sprint Capacity Intelligence"
version: 1
status: active
created: 2026-06-05
updated: 2026-06-05
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
| F-01 | integration-token-store     | (foundation) persist Jira PAT and calendar OAuth tokens securely                                                                             | —             | Access Control, NFR guardrails | ready    |
| S-01 | google-auth-jira-onboarding | sign in with Google and configure Jira PAT during onboarding                                                                                 | F-01          | FR-001, FR-002                 | proposed |
| S-02 | jira-sprint-picker          | select a sprint from Jira and see its assignees                                                                                              | S-01          | FR-003                         | proposed |
| S-03 | assignee-calendar-invite    | invite sprint assignees to connect Google Calendar; assignee connects via invite link                                                        | S-02          | FR-004, FR-005                 | proposed |
| S-04 | sprint-risk-table           | view a per-person risk table for the selected sprint (story points, meeting hours, context switches, risk level) for each connected assignee | S-02, S-03    | US-01, FR-006, FR-007          | proposed |

## Baseline

What's already in place in the codebase as of `2026-06-05` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 SSR + React 19 islands; file-based routing in `src/pages/`; shadcn/ui scaffold (only `button.tsx` so far).
- **Backend / API:** partial — Astro SSR + Cloudflare adapter; `src/middleware.ts`; auth-only API routes (`signin`/`signup`/`signout`); no domain endpoints.
- **Data:** partial — Supabase JS/SSR client for auth only; `supabase/config.toml` present; no migrations, schema, or seeded data.
- **Auth:** partial — Supabase email/password scaffold with cookie SSR client and route middleware; Google OAuth (PRD requirement) not wired.
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
- **Status:** ready

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
- **Status:** proposed

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
- **Status:** proposed

### S-03: Assignee calendar connect via invite

- **Outcome:** user can invite sprint assignees to connect their Google Calendar; assignee can connect via invite link (partial results OK — unconnected assignees omitted from output).
- **Change ID:** assignee-calendar-invite
- **PRD refs:** FR-004, FR-005
- **Prerequisites:** S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Invite link mechanism without groups UX (email vs shareable URL vs both) — Owner: user. Block: no (PRD commits to invite/link path for MVP; default to shareable link in planning).
  - Per-user OAuth vs EM delegated calendar read — Owner: user. Block: no (partial results mitigate; per-user OAuth is PRD-committed MVP path).
- **Risk:** Two Open Questions remain, but time pressure favors committing to the PRD's invite/link + per-user OAuth path rather than blocking — unblocks S-04 with acceptable partial coverage.
- **Status:** proposed

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
- **Risk:** North star slice — proves the core hypothesis end-to-end; sequenced immediately after calendar connect because US-01 requires at least one connected assignee and real Jira sprint data.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                   | Suggested issue title                                        | Ready for `/10x-plan` | Notes                                   | GitHub Issue                                                             |
| ---------- | --------------------------- | ------------------------------------------------------------ | --------------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| F-01       | integration-token-store     | Add secure token persistence for Jira PAT and calendar OAuth | yes                   | Run `/10x-plan integration-token-store` | [#1](https://github.com/Marce1ina/sprint-capacity-intelligence/issues/1) |
| S-01       | google-auth-jira-onboarding | Google sign-in and Jira PAT onboarding                       | no                    | After F-01                              | [#2](https://github.com/Marce1ina/sprint-capacity-intelligence/issues/2) |
| S-02       | jira-sprint-picker          | Select sprint from Jira and list assignees                   | no                    | After S-01                              | [#3](https://github.com/Marce1ina/sprint-capacity-intelligence/issues/3) |
| S-03       | assignee-calendar-invite    | Invite assignees and connect Google Calendar via link        | no                    | After S-02                              | [#4](https://github.com/Marce1ina/sprint-capacity-intelligence/issues/4) |
| S-04       | sprint-risk-table           | Per-person sprint risk table (north star)                    | no                    | After S-02 + S-03                       | [#5](https://github.com/Marce1ina/sprint-capacity-intelligence/issues/5) |

## Open Roadmap Questions

1. **How does the app obtain each assignee's calendar events?** — Per-user OAuth (invite/link) vs EM delegated read. Owner: user. Block: `roadmap-wide` for complete multi-person table; partial results mitigate for MVP (per PRD Open Questions #1).
2. **How are assignees invited to connect without groups UX?** — Invite link, email, or other mechanism. Owner: user. Block: S-03 planning detail (default: shareable invite link per PRD FR-004 committed path).

## Parked

- **GitHub Actions deploy job** — Why parked: time blocker + live Worker and Cloudflare Workers Builds already deliver; `tech-stack.md` targets `auto-deploy-on-merge` via GitHub Actions but defer until after north star slice lands.
- **No sprint execution tracking or real-time updates** — PRD §Non-Goals.
- **No Slack or GitHub integrations** — PRD §Non-Goals.
- **No groups creation/moderation UI** — PRD §Non-Goals; assignee invite/link replaces for v1.
- **No AI summary layer** — PRD §Non-Goals.
- **No team weekly risk visualization** — PRD §Non-Goals.

## Done
