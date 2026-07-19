---
change_id: sprint-risk-table
title: Per-person sprint risk table for connected assignees
status: planned
created: 2026-07-19
updated: 2026-07-19
archived_at: null
---

## Notes

Source: `context/foundation/roadmap.md` S-04 (north star slice).

Outcome: per-person risk table for selected sprint — story points, meeting hours, context switches, qualitative risk level (Low/Medium/High/Critical) per connected assignee.

PRD refs: US-01, FR-006, FR-007.
Prerequisites: S-02 (jira-sprint-picker, done), S-03 (assignee-calendar-invite — roadmap.md still shows "proposed" but git log shows p1-p4 + epilogue already landed; verify actual status before planning).

Open unknowns (owner: user, non-blocking per roadmap):

- Risk band threshold tuning (qualitative mapping from workload + meetings + context switches).
- Long-running analysis UX (NFR: visible progress if operation exceeds two seconds).
