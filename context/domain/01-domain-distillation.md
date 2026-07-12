---
title: Domain Distillation — Sprint Capacity Intelligence
created: 2026-07-11
type: domain-distillation
---

# Domain Distillation — Sprint Capacity Intelligence

> Product of this document is a **map of the business domain**, not code. Names, aggregates, and
> requirement IDs below were **discovered** from source documents and code, not assumed. Every claim
> is cited by `path:line`. Discovery → analysis → classification.

## Step 0 — Project context

### Source documents found

| Document                          | Path                                | Role                                  |
| --------------------------------- | ----------------------------------- | ------------------------------------- |
| PRD (vision, FRs, business logic) | `context/foundation/prd.md`         | Primary requirements source           |
| Roadmap (slices, status)          | `context/foundation/roadmap.md`     | Delivery state per requirement        |
| Shape notes (discovery narrative) | `context/foundation/shape-notes.md` | Extended narrative / decision history |
| Tech stack                        | `context/foundation/tech-stack.md`  | Stack + deployment context            |

Requirements documents **exist and are rich**, so this distillation is anchored primarily in the PRD
and shape notes, cross-checked against code. No "README-only" limitation applies.

### Stack & where business logic lives

- **Astro 6 SSR + React 19 islands, Tailwind 4, Supabase auth, Cloudflare Workers** (`context/foundation/tech-stack.md:5-8`, `context/foundation/tech-stack.md:29`).
- **Layers observed in `src/`:**
  - API routes (JSON + form handlers): `src/pages/api/**` (e.g. `src/pages/api/jira/sprints/[sprintId]/assignees.ts:8`).
  - Domain/service layer: `src/lib/services/**` (`jira-client.ts`, `integration-token-service.ts`, `google-revoke.ts`).
  - Shared helpers + auth context: `src/lib/**` (`jira-api-context.ts`, `jira-site-url.ts`, `middleware.ts`).
  - Shared DTO/entity types: `src/types.ts`.
  - UI (islands + hooks): `src/components/**`, `src/components/hooks/use-jira-sprint-picker.ts`.
  - Persistence: single migration `supabase/migrations/20260605120000_integration_tokens.sql`.

### Delivery state (critical framing)

Per the roadmap, only slices **F-01, S-01, S-02, S-05** are `done`; **S-03 (calendar connect)** and
**S-04 (per-person risk table — the north star)** are `proposed` (`context/foundation/roadmap.md:32-37`).
The roadmap names S-04 the **north star**: "the smallest end-to-end flow that proves EMs get a useful
pre-sprint overload signal" (`context/foundation/roadmap.md:24`). **The core of the product is not yet
built.** This dominates every finding below.

---

## Step 1 — Ubiquitous Language

Terms extracted from documents **and** code. "NOT IN CODE" = concept exists in the domain docs but
has **no representation in code**.

| Term                                       | Definition                                                                                                      | Source citation (doc)                        | Where it lives in code                                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Sprint Capacity / Focus Capacity**       | Available uninterrupted focus time to deliver planned scope; the product's unit of judgement.                   | `prd.md:18-20`, `prd.md:104`                 | **NOT IN CODE** — no capacity concept exists.                                                                                 |
| **Attention Fragmentation** (core insight) | Productivity is limited less by workload volume than by fragmentation of focused time by meetings and switches. | `prd.md:20`, `shape-notes.md:39`             | **NOT IN CODE**.                                                                                                              |
| **Overload Risk / Risk Level**             | Qualitative judgement of whether a sprint is achievable, in bands Low / Medium / High / Critical.               | `prd.md:61`, `prd.md:106`                    | **NOT IN CODE** — no risk type, no bands.                                                                                     |
| **Sprint**                                 | A time-boxed Jira sprint with a window (start/end) that scopes the analysis.                                    | `prd.md:77`, `prd.md:62`                     | `src/types.ts:43-49` (`JiraSprint`); fetched in `jira-client.ts:243-257`.                                                     |
| **Sprint Window**                          | Start/end dates bounding which calendar events count.                                                           | `prd.md:62`, `prd.md:106`                    | Present as fields `JiraSprint.startDate/endDate` (`src/types.ts:47-48`) but **not consumed** anywhere.                        |
| **Board**                                  | Jira board grouping sprints; selection entry point.                                                             | `prd.md:77` (implied by "select a sprint")   | `src/types.ts:37-41` (`JiraBoard`); `jira-client.ts:233-241`.                                                                 |
| **Sprint Assignee**                        | A person assigned tickets in the sprint; unit of the per-person table.                                          | `prd.md:56`, `prd.md:60`                     | `src/types.ts:51-55` (`SprintAssignee`); built in `jira-client.ts:259-284`.                                                   |
| **Story Points**                           | Assigned-work volume per assignee; PRD says this is an _insufficient_ signal alone.                             | `prd.md:18-20`, `prd.md:56`                  | `jira-client.ts:39-47` (`readStoryPoints`), aggregated `jira-client.ts:272-273`.                                              |
| **Meeting Hours**                          | Time consumed by meetings in the sprint window, degrading focus capacity.                                       | `prd.md:56`, `prd.md:104-106`                | **NOT IN CODE**.                                                                                                              |
| **Context Switch**                         | A transition between focused work and a meeting (work→meeting or meeting→work), counted per transition.         | `prd.md:106`                                 | **NOT IN CODE**.                                                                                                              |
| **Calendar Event / Meeting**               | Assignee calendar entry (timestamp + duration) — raw input to meeting hours & switches.                         | `prd.md:106`, `prd.md:132`                   | **NOT IN CODE** — no calendar client; only a token _payload_ type `GoogleCalendarTokenPayload` (`src/types.ts:8-13`).         |
| **Calendar Connection (invite/link)**      | Assignee grants calendar access via invite/link; partial results allowed.                                       | `prd.md:37`, `prd.md:85`, `prd.md:112`       | **NOT IN CODE** — no invite/connect flow. Google OAuth requests **no calendar scope** (`src/pages/api/auth/google.ts:15-20`). |
| **Engineering Manager (EM)**               | Primary persona; makes the sprint commitment decision.                                                          | `prd.md:24-26`                               | Represented only as generic auth `User` (`src/middleware.ts:18-22`, `jira-api-context.ts:10-13`). No EM role modelled.        |
| **Integration Token**                      | Encrypted per-user credential for a provider (Jira PAT / Google Calendar OAuth).                                | `prd.md:46`, `prd.md:111-112`                | `src/types.ts:1-22`; `integration-token-service.ts:7-152`; table `20260605120000_integration_tokens.sql:3-11`.                |
| **Jira PAT**                               | User-supplied Atlassian Personal Access Token (not OAuth).                                                      | `prd.md:72`, `prd.md:111`                    | `JiraTokenPayload` (`src/types.ts:3-6`); `integration-token-service.ts:95-97`.                                                |
| **Account / Data purge**                   | EM account and all stored integration data can be permanently deleted (data minimization).                      | `prd.md:44-48`, roadmap S-05 `roadmap.md:37` | `src/pages/api/account/delete.ts:11-67`; `deleteAllTokens` (`integration-token-service.ts:131-137`).                          |
| **Group / Moderator**                      | Post-MVP concept: EM creates a group, acts as moderator.                                                        | `prd.md:113`, `shape-notes.md:52`            | **NOT IN CODE** — explicitly deferred (`prd.md:119`).                                                                         |

---

## Step 2 — Subdomain classification (Core / Supporting / Generic)

Rationale is tied to product goals: the "sense" of the product is the **pre-sprint overload signal
built on attention fragmentation** (`prd.md:20`, `roadmap.md:24`). That is the differentiator; Jira/
calendar ingestion and auth are commodities in service of it.

| Domain area                                                                                    | Category       | Justification (goal reference)                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sprint Risk Analysis** (workload + meeting hours + context switches → qualitative risk band) | **Core**       | This _is_ the product's reason to exist and its only MVP output surface; it encodes the core insight (`prd.md:104-106`, `prd.md:20`) and is the north star (`roadmap.md:24`). |
| **Attention Fragmentation model** (meeting-time burden + switching friction degrading focus)   | **Core**       | The insight "that makes this product worth building" (`prd.md:20`). Without it the product is just another Jira load view (`prd.md:26`).                                      |
| **Jira sprint/board/assignee ingestion**                                                       | **Supporting** | Necessary real input (`prd.md:73`), but generic agile data any tool reads; value is in what's computed from it, not the fetch.                                                |
| **Calendar connection & event ingestion**                                                      | **Supporting** | Required data acquisition for the core (`prd.md:85`), but the mechanism (invite/link, OAuth) is plumbing, not differentiation.                                                |
| **Google OAuth sign-in**                                                                       | **Generic**    | Commodity identity (`prd.md:68`); satisfied by Supabase (`src/pages/api/auth/google.ts`).                                                                                     |
| **Integration token encryption & storage**                                                     | **Generic**    | Standard secure-secret handling (`prd.md:46`); guardrail, not differentiator.                                                                                                 |
| **Account deletion / data purge**                                                              | **Generic**    | Standard data-minimization/compliance capability (`prd.md:48`, `roadmap.md:37`).                                                                                              |

> Note: today's **codebase implements only the Supporting + Generic areas**. Both **Core** areas are
> absent (see Step 4).

---

## Step 3 — Aggregate candidates & invariants

| Aggregate candidate                   | Invariant that MUST always hold                                                                                                                                                                         | Source of invariant           | Code status                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **SprintRiskAssessment** (core)       | Risk for an assignee is derived from workload **plus** meeting hours **plus** context switches, and is expressed only as a qualitative band (Low/Medium/High/Critical) — never a precise numeric score. | `prd.md:106`, `prd.md:61`     | **IGNORED** — no such type or computation exists anywhere in `src/`.                                                                                               |
| **SprintRiskAssessment** (membership) | The table includes **only** assignees with connected calendar data (partial results OK); unconnected assignees are omitted.                                                                             | `prd.md:60`, `roadmap.md:96`  | **IGNORED** — no calendar linkage; the current table shows _all_ Jira assignees regardless of calendar (`SprintPicker.tsx:146-154`).                               |
| **SprintAssigneeLoad**                | Analysis is bounded to the sprint window; only events within `[startDate, endDate]` count toward meeting hours / switches.                                                                              | `prd.md:62`, `prd.md:106`     | **IGNORED** — window fields exist unused (`src/types.ts:47-48`); load is only summed story points (`jira-client.ts:272-273`).                                      |
| **IntegrationToken**                  | Exactly one token per `(user, provider)`; payload is encrypted at rest and never returned to UI or logs.                                                                                                | `prd.md:46`, `prd.md:111-112` | **ENFORCED** — unique constraint `20260605120000_integration_tokens.sql:10`; encryption `integration-token-service.ts:25`; RLS `..._integration_tokens.sql:17-21`. |
| **CalendarConnection**                | Each assignee's calendar is accessed only with that assignee's own consent (per-user OAuth via invite).                                                                                                 | `prd.md:83-85`, `prd.md:112`  | **IGNORED** — no connection entity; Google OAuth requests no calendar scope (`google.ts:15-20`).                                                                   |
| **Account**                           | Deleting the account purges **all** stored integration tokens (data minimization).                                                                                                                      | `prd.md:48`, `roadmap.md:37`  | **ENFORCED** — `deleteAllTokens` before user delete (`account/delete.ts:45-47`; `integration-token-service.ts:131-137`).                                           |

---

## Step 4 — MODEL vs CODE divergences (most valuable section)

Where domain knowledge exists in the docs but the code does not model it.

| #   | Document says (X)                                                                                                                     | Code does (Y)                                                                                                                                | Evidence (`path:line`)                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| D-1 | Per-person **risk** from workload + meeting hours + context switches, mapped to Low/Medium/High/Critical (`prd.md:56`, `prd.md:106`). | No risk model, no bands, no meeting/switch inputs exist. The one output surface shows **Name + Story Points only**.                          | `SprintPicker.tsx:141-142`, `SprintPicker.tsx:151-152`; grep for `risk\|meeting\|context switch` in `src/` → no domain code. |
| D-2 | Story points are explicitly declared **insufficient** — they measure volume, not available attention (`prd.md:20`).                   | The product's only computed signal _is_ aggregated story points.                                                                             | `jira-client.ts:259-284` (`getSprintAssignees` → `totalStoryPoints`).                                                        |
| D-3 | Table includes **only assignees with connected calendars**; partial results OK (`prd.md:60`).                                         | Table lists **all** Jira assignees; there is no calendar concept to filter by.                                                               | `SprintAssignee` has no calendar link (`src/types.ts:51-55`); rendered unfiltered (`SprintPicker.tsx:146-154`).              |
| D-4 | Assignees connect Google Calendar via **invite/link** (`prd.md:85`, `prd.md:112`).                                                    | No invite flow, no calendar OAuth; Google sign-in requests default scopes only.                                                              | `src/pages/api/auth/google.ts:15-20` (no calendar scope, no invite route in `src/pages/api/**`).                             |
| D-5 | Analysis uses the **sprint window** from Jira (`prd.md:62`).                                                                          | `startDate`/`endDate` are fetched into the DTO but never read by any logic.                                                                  | Defined `src/types.ts:47-48`; set `jira-client.ts:256`; zero downstream consumers.                                           |
| D-6 | **Calendar events (meetings with timestamps + durations)** are core inputs (`prd.md:106`).                                            | Only a _token payload_ shape exists; no event fetching, parsing, or storage.                                                                 | `GoogleCalendarTokenPayload` (`src/types.ts:8-13`); no calendar client under `src/lib/services/`.                            |
| D-7 | Primary actor is the **Engineering Manager** making commitment decisions (`prd.md:24`).                                               | Modelled only as a generic authenticated `User`; no EM role or capability boundary.                                                          | `src/middleware.ts:18-22`, `jira-api-context.ts:10-13`.                                                                      |
| D-8 | NFR: operations over 2s must show **continuous visible progress** (`prd.md:99`).                                                      | Generic spinner overlay exists for the picker; adequate for current calls but no long-running risk-analysis progress model (feature absent). | `SprintPicker.tsx:32-40`.                                                                                                    |

Divergences D-1 → D-6 all point at the same gap: **the entire Core subdomain is undocumented-in-code.**
The knowledge lives in the PRD; the code stops at Supporting-level Jira ingestion.

---

## Step 5 — Refactor ranking

Ranked by **value** (how core the invariant) × **risk** (how weakly enforced today).

| Rank   | Aggregate                         | Value                                                                               | Risk (current enforcement)                                                                                                           |
| ------ | --------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **#1** | **SprintRiskAssessment**          | Highest — it is the product's reason to exist and the north star (`roadmap.md:24`). | Highest — completely **IGNORED**; the shipped table exposes exactly the signal (story points) the PRD calls insufficient (D-1, D-2). |
| #2     | **CalendarConnection**            | High — gates every risk row; without it the core has no meeting/switch inputs.      | High — IGNORED; not even the OAuth scope is requested (D-4, D-6).                                                                    |
| #3     | **SprintAssigneeLoad (windowed)** | Medium-high — correctness boundary for meeting hours & switches.                    | Medium — window data present but unused (D-5).                                                                                       |
| #4     | **IntegrationToken**              | Medium — guardrail for trust.                                                       | Low — already ENFORCED (encryption + RLS + uniqueness).                                                                              |
| #5     | **Account**                       | Medium — compliance.                                                                | Low — already ENFORCED (purge-then-delete).                                                                                          |

**#1 to refactor/build: `SprintRiskAssessment`.** It carries the only invariant that is simultaneously
the product's core value ("qualitative risk from workload + meeting hours + context switches",
`prd.md:106`) and the most weakly represented in code (nonexistent). Every other backlog item only
matters if this aggregate exists. Concretely, `getSprintAssignees` (`jira-client.ts:259-284`) and the
`SprintAssignee` type (`src/types.ts:51-55`) are the seams where the story-points-only load must grow
into a full risk assessment fed by calendar-derived meeting hours and context switches — with the
qualitative-band invariant enforced in the domain layer rather than the UI.

---

## Constraints honored

- No production code written; all citations are paths/lines verified during this pass.
- Concepts absent from code are explicitly marked **NOT IN CODE**.
- Scope limited to the discovered documents and `src/` + `supabase/` sources.
