---
project: "Sprint Capacity Intelligence"
version: 1
status: draft
created: 2026-05-23
context_type: greenfield
product_type: web-app
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-06-30
  after_hours_only: true
---

## Vision & Problem Statement

Engineering Managers commit to sprint scope before the sprint starts without knowing whether the team has enough uninterrupted focus time to deliver what is planned. During sprint planning, the default inputs are story points, ticket counts, and assignee load — but those signals ignore how much of the sprint is consumed by meetings and how often people transition between focused work and meetings.

The insight that makes this product worth building: productivity is limited less by workload volume and more by fragmentation of focused time. Story points measure how much work is assigned; they do not measure how much attention capacity is actually available once meeting load and context switching are accounted for.

## User & Persona

**Primary persona — Engineering Manager**

An Engineering Manager responsible for sprint commitment decisions and team health. They reach for this product in the days before sprint start or during sprint planning, when they need to answer: "Is this sprint realistically achievable given the team's available focused time?" Today they rely on Jira workload views and gut feel; they lack a pre-sprint signal that combines planned scope with calendar reality.

## Success Criteria

### Primary

MVP flow proves the core value end-to-end:

1. EM signs in with Google
2. Onboarding: configure Jira PAT (no EM calendar connection in MVP)
3. Select a sprint from Jira
4. Assignees connect Google Calendar via invite/link (no group creation in MVP)
5. EM views per-person risk table — partial results OK (connected assignees only)

### Secondary

- None for MVP — team weekly visualization deferred post-MVP.

### Guardrails

- Jira PAT and Calendar tokens stored securely; not exposed in UI or logs
- Product evaluates capacity before sprint start only — no execution tracking during the sprint
- Calendar/Jira data used only for capacity analysis; data minimization applies

## User Stories

### US-01: EM evaluates sprint capacity risk before sprint start

- **Given** an EM signed in with Google, with Jira PAT configured, and at least one sprint assignee has connected their calendar
- **When** the EM selects a sprint from Jira
- **Then** the EM sees a per-person risk table showing story points, meeting hours, context switches, and risk level for each connected assignee

#### Acceptance Criteria

- Table includes only assignees with connected calendar data (partial results OK)
- Risk level uses qualitative bands (Low / Medium / High / Critical), not precise numeric scores
- Analysis uses sprint window from Jira; no execution tracking during sprint

## Functional Requirements

### Onboarding & auth

- FR-001: EM can sign in with Google. Priority: must-have

  > Socrates: Counter-argument considered: "Google OAuth adds setup complexity before any value is shown." Resolution: kept — OAuth is required for assignee Google Calendar access; complexity is an accepted onboarding cost.

- FR-002: EM can configure Jira access with a Personal Access Token during onboarding. Priority: must-have
  > Socrates: Counter-argument considered: "Defer Jira; prove algorithm on mock sprint data first." Resolution: kept — real Jira sprint data is core to the product job; mock data does not prove pre-sprint capacity evaluation.

### Sprint & calendar data

- FR-003: EM can select a sprint from Jira. Priority: must-have

  > Socrates: No counter-argument; it stands as written.

- FR-004: EM can invite sprint assignees to connect their Google Calendar. Priority: must-have

  > Socrates: Counter-argument considered: "EM delegated read might make invites unnecessary." Resolution: kept for MVP — invite/link is the committed path; delegated read remains an Open Question for technical spike.

- FR-005: Assignee can connect their Google Calendar via invite/link. Priority: must-have
  > Socrates: No counter-argument; it stands as written.

### Risk analysis

- FR-006: System can compute per-person sprint risk from Jira sprint data and connected assignee calendar data (workload, meeting hours, context switches → risk level). Priority: must-have

  > Socrates: No counter-argument; it stands as written.

- FR-007: EM can view a per-person risk table for the selected sprint. Priority: must-have
  > Socrates: No counter-argument; it stands as written.

## Non-Functional Requirements

- After selecting a sprint, the EM sees sprint risk results within a perceptible wait; any operation that takes longer than two seconds shows continuous visible progress until results appear.
- Calendar and Jira data are not retained beyond what the sprint capacity analysis requires.

## Business Logic

The product evaluates sprint achievability by comparing planned workload against available focus capacity degraded by meeting hours and work↔meeting context switches, then assigns a qualitative overload risk level.

The rule consumes Jira sprint data (assigned tickets, story points, assignees) and assignee calendar events (meetings with timestamps and durations) for the sprint window. A context switch is counted for each transition between focused work and a meeting (work → meeting or meeting → work). The combined overload signal from workload pressure, meeting time burden, and context-switching friction is mapped to qualitative risk bands (Low / Medium / High / Critical). The UI presents risk qualitatively — it intentionally avoids overly precise numeric interpretation.

## Access Control

- **Sign-in:** Google OAuth login.
- **Jira integration:** User configures Atlassian access during onboarding by supplying a Personal Access Token (PAT) — not OAuth-based Atlassian auth.
- **Team calendar access (MVP):** Sprint assignees connect their Google Calendar via invite/link. No group creation UI in MVP. Partial results are acceptable — show risk for connected assignees only.
- **Groups (post-MVP target):** The app will use a groups concept where the EM creates a group and acts as moderator. Group members view all group data but cannot change group settings. Deferred beyond MVP.

## Non-Goals

- **No sprint execution tracking or real-time updates** — product evaluates capacity before sprint start only; it does not monitor progress during the sprint.
- **No Slack or GitHub integrations** — MVP uses Jira and Google Calendar only.
- **No groups creation/moderation UI in MVP** — assignee invite/link replaces full groups UX for v1.
- **No AI summary layer in MVP** — descriptive natural-language risk explanation deferred post-MVP.
- **No team weekly risk visualization in MVP** — per-person risk table is the sole output surface for v1.

## Open Questions

1. **How does the app obtain each assignee's calendar events?** — Per-user OAuth (invite/link) vs EM delegated read (calendars already shared with EM). Owner: technical spike during stack selection. Block: yes for complete multi-person table; partial results mitigate for MVP.
2. **How are assignees invited to connect without groups UX?** — Invite link, email, or other mechanism. Owner: product + technical spike. By: before implementation planning.
