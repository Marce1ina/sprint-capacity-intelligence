---
title: Invariant Aggregate Refactor — Sprint Overload Risk Verdict
created: 2026-07-11
type: refactor-plan
---

# Invariant Aggregate Refactor — Sprint Overload Risk Verdict

> This document is a **refactor plan**, not an implementation. No production code is modified here.
> Which invariant is core and which entity names are used were **discovered and chosen** from the
> source documents and code below — not assumed in advance. Every factual claim is cited by
> `path:line`, and only citations verified during this pass are used. Workflow: discovery →
> identification → classification → diagnosis → design.

---

## Step 0 — Context discovered

### Requirement documents found

| Document                     | Path                                       | Role in this analysis                                     |
| ---------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| PRD (vision, FRs, biz logic) | `context/foundation/prd.md`                | Primary source of business rules and success criteria     |
| Roadmap (slices, north star) | `context/foundation/roadmap.md`            | Delivery state + which invariant carries the product goal |
| Test plan (risk map)         | `context/foundation/test-plan.md`          | Existing test discipline + risk framing for this domain   |
| Lessons                      | `context/foundation/lessons.md`            | Recurring rules (external-service cost, hosted config)    |
| Prior domain distillation    | `context/domain/01-domain-distillation.md` | Ubiquitous language + aggregate ranking (cross-checked)   |

Requirement docs **exist and are rich**, so the analysis is anchored in the PRD and roadmap and
cross-checked against `src/`. The "Business Logic" (`prd.md:102-106`), "Success Criteria"
(`prd.md:28-48`), and US-01 acceptance criteria (`prd.md:58-62`) are the rule-bearing sections.

### Stack and where business logic lives

- **Astro 6 SSR + React 19 islands, Tailwind 4, Supabase auth, Cloudflare Workers**
  (`context/foundation/tech-stack.md:5-8`, `tech-stack.md:29`).
- **Layers observed in `src/`:**
  - API routes (JSON + form handlers): `src/pages/api/**` (e.g. `src/pages/api/jira/sprints/[sprintId]/assignees.ts:8`).
  - Service / integration layer: `src/lib/services/**` (`jira-client.ts`, `integration-token-service.ts`).
  - Shared auth + request context: `src/lib/jira-api-context.ts`, `src/middleware.ts`.
  - Shared DTO/entity types: `src/types.ts`.
  - UI islands + hooks: `src/components/dashboard/SprintPicker.tsx`, `src/components/hooks/use-jira-sprint-picker.ts`.
  - Persistence: `supabase/migrations/20260605120000_integration_tokens.sql`.
- **There is no domain layer today.** Business judgement is either absent or lives in the UI (see Step 3).

### Delivery state (frames everything below)

Only **F-01, S-01, S-02, S-05** are `done`; **S-03 (calendar connect)** and **S-04 (per-person risk
table — the north star)** are `proposed` (`roadmap.md:32-37`). The roadmap names S-04 the north star:
"everything else only matters if this works" (`roadmap.md:24`). The product's core output surface is
not built; the shipped dashboard shows a **story-points-only** table (`SprintPicker.tsx:137-158`).

---

## Step 1 — Business invariants identified

Rules that MUST always hold in this domain, extracted from documents **and** code.

| #   | Invariant (must always be true)                                                                                                                      | Source (doc / code)                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| I-1 | An assignee's overload **risk is derived from the triad {workload, meeting hours, context switches}** — never workload alone.                        | `prd.md:104-106`, `prd.md:20` (story points explicitly insufficient), `prd.md:56`                                |
| I-2 | Risk is expressed **only as a qualitative band** (Low / Medium / High / Critical) — never a precise numeric score exposed to the user.               | `prd.md:61`, `prd.md:106`                                                                                        |
| I-3 | The risk table includes **only assignees with connected calendar data**; partial results are correct (unconnected assignees are omitted, not faked). | `prd.md:60`, `prd.md:37-38`, `prd.md:112`                                                                        |
| I-4 | Meeting hours and context switches are counted **only within the sprint window** `[startDate, endDate]`.                                             | `prd.md:62`, `prd.md:106`                                                                                        |
| I-5 | A context switch is counted for **each work↔meeting transition** (work→meeting or meeting→work).                                                     | `prd.md:106`                                                                                                     |
| I-6 | Each assignee's calendar is accessed **only with that assignee's own consent** (per-user OAuth via invite/link).                                     | `prd.md:83-85`, `prd.md:112`                                                                                     |
| I-7 | Exactly **one integration token per `(user, provider)`**, encrypted at rest, **never returned to UI or logs**.                                       | `prd.md:46`, `prd.md:111-112`; enforced `..._integration_tokens.sql:10,15-21`, `integration-token-service.ts:25` |
| I-8 | Deleting an account **purges all** stored integration tokens.                                                                                        | `prd.md:44-48`, `roadmap.md:37`; enforced `account/delete.ts:45-47`                                              |
| I-9 | The product evaluates capacity **before sprint start only** — no execution tracking during the sprint.                                               | `prd.md:47`, `prd.md:117`                                                                                        |

I-1 through I-5 are five facets of the **same core rule**: the per-person overload verdict. I-2, I-3,
I-4 are the enforceable, testable edges of it and become the guarded invariant of this plan.

---

## Step 2 — Classification and selection of #1

Each invariant scored on three axes: **(a) core** to the product's meaning (goal reference),
**(b) spread** across layers, **(c) enforcement** state — `ENFORCED` / `DECLARED-ONLY` / `VIOLABLE`.

| #   | (a) Core to product meaning                                              | (b) Spread across layers                                               | (c) Enforcement today                                                                                     |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| I-1 | **Highest** — it _is_ the reason to build (`prd.md:20`, `roadmap.md:24`) | Should span domain+repo+route+UI; today only story points leak UI-ward | **VIOLABLE** — no risk model; UI shows the signal the PRD calls insufficient (`SprintPicker.tsx:151-152`) |
| I-2 | Highest — the north-star output contract                                 | Should be domain→route→UI                                              | **VIOLABLE** — no band type exists anywhere in `src/`                                                     |
| I-3 | Highest — defines who is on the table at all                             | Should gate repo+route+UI                                              | **VIOLABLE** — no calendar concept; UI lists _all_ Jira assignees (`SprintPicker.tsx:146-154`)            |
| I-4 | High — correctness boundary                                              | DTO carries window fields, nothing reads them                          | **VIOLABLE** — `startDate/endDate` fetched (`types.ts:47-48`) then never consumed                         |
| I-5 | High — the "fragmentation" insight                                       | Would live in domain                                                   | **VIOLABLE** — absent                                                                                     |
| I-6 | Medium-high — trust/consent                                              | Would span OAuth route + repo                                          | **VIOLABLE** — Google OAuth requests no calendar scope (`google.ts:15-20`)                                |
| I-7 | Medium — guardrail for trust                                             | service + routes + migration + tests                                   | **ENFORCED** — unique constraint, RLS, encryption, secret-scan tests                                      |
| I-8 | Medium — compliance                                                      | delete route + service                                                 | **ENFORCED** — purge-then-delete (`account/delete.ts:45-47`)                                              |
| I-9 | Medium — scope guardrail                                                 | product-level                                                          | **DECLARED-ONLY** — no execution-tracking code exists to violate it                                       |

### Selected invariant #1

> **I-1 (+ its edges I-2, I-3, I-4): "A sprint assignee's overload risk is a server-computed
> qualitative band derived from the complete triad {workload, meeting hours within the sprint window,
> context switches}; only assignees with connected calendar data are surfaced; no proxy signal (raw
> story points alone) may be presented as the verdict, and the verdict is never a bare number."**

**Why this one.** It is simultaneously the **most core** invariant — the product exists to produce
this verdict (`prd.md:20`, `prd.md:104-106`, north star `roadmap.md:24`) — and the **most weakly
enforced**: it has zero representation in the domain, and worse, the shipped UI actively **contradicts**
it by presenting raw story points as the load verdict (`SprintPicker.tsx:141-142,151-152`), which
`prd.md:20` explicitly declares an insufficient signal. Every other backlog item only matters if this
holds (`roadmap.md:24`). I-7 and I-8, though also important, are already `ENFORCED` and fail the
"weakly enforced" axis. This is a genuine _refactor_ target, not only greenfield: an existing pipeline
(`jira-client.ts` → assignees route → hook → `SprintPicker`) already produces and renders a **wrong
answer to the core question**, with enforcement living only on the client. The refactor replaces that
UI-resident proxy verdict with a server-side domain aggregate that either produces the real triad-based
band or, honestly, produces nothing (partial results) — which is strictly better than a false "load"
signal.

---

## Step 3 — Diagnosis of I-1 across layers

Where the rule (or its violation) lives today, with the enforcement pathology named.

### 3.1 The client is the only "guardian" — and it guards the wrong rule

The single place any per-person load judgement reaches a human is the React table, and it renders
**story points as the verdict**:

```137:158:src/components/dashboard/SprintPicker.tsx
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-white/10 hover:bg-transparent">
          <TableHead className="text-blue-100/80">Name</TableHead>
          <TableHead className="text-right text-blue-100/80">Story Points</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assignees.map((assignee) => (
          <TableRow
            key={assignee.accountId ?? "unassigned"}
            className={cn("border-white/10 text-white hover:bg-white/5")}
          >
            <TableCell>{assignee.displayName}</TableCell>
            <TableCell className="text-right font-medium tabular-nums">{assignee.totalStoryPoints}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
```

There is no risk band (violates I-2), no meeting/switch columns (violates I-1), and no calendar filter
(violates I-3) — the UI is the de-facto authority on "load" and it encodes a rule the PRD rejects.

### 3.2 The service computes only workload (I-1 violated at the source)

`getSprintAssignees` aggregates story points and nothing else:

```259:284:src/lib/services/jira-client.ts
export async function getSprintAssignees(
  siteUrl: string,
  pat: string,
  accountEmail: string,
  sprintId: number,
): Promise<SprintAssignee[]> {
  const issues = await listSprintIssues(siteUrl, pat, accountEmail, sprintId);
  const byKey = new Map<string, SprintAssignee>();

  for (const issue of issues) {
    const key = issue.assigneeAccountId ?? "unassigned";

    const existing = byKey.get(key);
    if (existing) {
      existing.totalStoryPoints += issue.storyPoints;
    } else {
      byKey.set(key, {
        accountId: issue.assigneeAccountId,
        displayName: issue.assigneeDisplayName,
        totalStoryPoints: issue.storyPoints,
      });
    }
  }

  return [...byKey.values()].sort((a, b) => b.totalStoryPoints - a.totalStoryPoints);
}
```

The DTO it returns has no place for the other two-thirds of the triad:

```51:55:src/types.ts
export interface SprintAssignee {
  accountId: string | null;
  displayName: string;
  totalStoryPoints: number;
}
```

### 3.3 The sprint window is fetched but never enforced (I-4 violated)

`listActiveFutureSprints` carries `startDate`/`endDate` into the DTO:

```43:49:src/types.ts
export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
}
```

No code path reads these fields — the boundary condition for meeting hours and switches has **zero
consumers**. The rule is declared in the type and violated by omission.

### 3.4 Errors are swallowed instead of stopping the operation

- **Client swallow.** On any failure the hook drops results to an empty array and shows a generic
  string — a partial/failed load is indistinguishable from "no assignees":

```104:118:src/components/hooks/use-jira-sprint-picker.ts
      try {
        const data = await fetchJson<AssigneesResponse>(`/api/jira/sprints/${sprintId}/assignees`);
        if (requestId !== assigneesRequestRef.current) {
          return;
        }
        setAssignees(data.assignees);
      } catch (err) {
        if (requestId !== assigneesRequestRef.current) {
          return;
        }
        setAssignees([]);
        setError(err instanceof Error ? err.message : "Could not load sprint assignees from Jira.");
      } finally {
        endLoading();
      }
```

- **Silent under-count.** Missing story-point fields resolve to `0` with no signal, so an
  under-counted workload looks identical to a real zero:

```39:47:src/lib/services/jira-client.ts
function readStoryPoints(fields: SprintIssueFields): number {
  if (typeof fields.storyPoints === "number") {
    return fields.storyPoints;
  }
  if (typeof fields.customfield_10016 === "number") {
    return fields.customfield_10016;
  }
  return 0;
}
```

- **Fail-open guard.** A related invariant (the onboarding gate) fails open — the token check logs and
  continues rather than stopping:

```44:48:src/middleware.ts
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      // eslint-disable-next-line no-console -- fail-open guard; log PostgREST errors without token data
      console.error("Jira token check failed:", message);
    }
```

### 3.5 The route is a thin pass-through of the wrong verdict (I-1/I-2/I-3 not enforced server-side)

```19:27:src/pages/api/jira/sprints/[sprintId]/assignees.ts
  try {
    const assignees = await getSprintAssignees(resolved.siteUrl, resolved.pat, resolved.email, sprintId);
    return new Response(JSON.stringify({ assignees, sprintId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return mapJiraClientError(error, "Could not load sprint assignees from Jira. Please try again.");
  }
```

The route faithfully returns story points. No layer between Jira and the browser asserts I-1/I-2/I-3.

### 3.6 The consent precondition for calendar data is not even requested (I-6, gating I-3)

Google sign-in requests **no calendar scope** — there is no `scopes` option, so the data the triad
needs cannot be obtained:

```15:20:src/pages/api/auth/google.ts
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/api/auth/callback`,
    },
  });
```

**Diagnosis summary.** The core invariant is enforced nowhere on the server. Its only "home" is a UI
table that encodes an explicitly-rejected proxy rule, fed by a service that computes one of three
inputs, ignoring the window boundary, swallowing partial failures, and without the consent flow needed
to obtain the missing inputs. This is the textbook case for a guardian aggregate.

---

## Step 4 — Design: the guardian aggregate

One aggregate becomes the **only** place I-1/I-2/I-3/I-4/I-5 are enforced. Illegal operations raise
**named domain errors** and stop; they never silently substitute a proxy value.

### 4.1 Aggregate boundary

**Aggregate root: `SprintRiskAssessment`.** It owns a `SprintWindow` and a set of per-assignee
`AssigneeRiskRow` entities. Invariants live on the root; nothing outside constructs a band.

```
SprintRiskAssessment (root)
├─ sprintId: number
├─ window: SprintWindow            // value object; validated closed interval  (I-4)
├─ rows: AssigneeRiskRow[]         // only calendar-connected assignees        (I-3)
└─ (no public numeric score)                                                    (I-2)

AssigneeRiskRow (entity, inside the aggregate)
├─ accountId: string
├─ displayName: string
├─ workload: Workload              // story points (one of three inputs)        (I-1)
├─ meetingLoad: MeetingLoad        // hours + switches, window-bounded          (I-1, I-4, I-5)
└─ band: RiskBand                  // Low | Medium | High | Critical            (I-2)

Value objects
├─ SprintWindow { start: Date; end: Date }      // invariant: start < end
├─ RiskBand = "Low" | "Medium" | "High" | "Critical"
├─ Workload { storyPoints: number }
└─ MeetingLoad { hours: number; contextSwitches: number }
```

### 4.2 Domain methods with preconditions (signatures + pseudocode)

```typescript
// src/lib/domain/sprint-risk-assessment.ts  (NEW — illustrative signatures only)

export class SprintRiskAssessment {
  private constructor(
    readonly sprintId: number,
    private readonly window: SprintWindow,
    private readonly rows: AssigneeRiskRow[],
  ) {}

  /** Factory. Precondition I-4: the sprint must have a valid, closed window. */
  static forSprint(sprintId: number, window: SprintWindow): SprintRiskAssessment {
    // SprintWindow constructor already threw InvalidSprintWindowError if start >= end.
    return new SprintRiskAssessment(sprintId, window, []);
  }

  /**
   * Assess one assignee. Enforces I-1, I-3, I-4, I-5.
   * Illegal operations throw — they NEVER fall back to a story-points-only verdict.
   */
  assess(input: {
    accountId: string;
    displayName: string;
    workload: Workload;
    calendarConnected: boolean;
    events: CalendarEvent[]; // raw calendar entries for this assignee
  }): void {
    // I-3: unconnected assignees are OMITTED (partial results), not faked.
    if (!input.calendarConnected) return;

    // I-1: all three inputs are required to produce a verdict.
    //      Missing calendar data for an included assignee is illegal, not a fallback.
    if (input.events === undefined) {
      throw new MissingCalendarDataError(input.accountId);
    }

    // I-4: every event must lie within the sprint window, else fail fast.
    for (const e of input.events) {
      if (!this.window.contains(e)) {
        throw new EventOutsideSprintWindowError(input.accountId, e.start);
      }
    }

    // I-5: count each work<->meeting transition; I-1: combine the triad.
    const meetingLoad = MeetingLoad.fromEvents(input.events, this.window);
    const band = RiskBand.fromTriad(input.workload, meetingLoad); // pure mapping (Risk #4)

    this.rows.push(new AssigneeRiskRow(input.accountId, input.displayName, input.workload, meetingLoad, band));
  }

  /** I-2: the aggregate exposes bands only — there is no numeric-score getter. */
  toView(): AssigneeRiskRowView[] {
    return this.rows.map((r) => ({
      accountId: r.accountId,
      displayName: r.displayName,
      storyPoints: r.workload.storyPoints,
      meetingHours: r.meetingLoad.hours,
      contextSwitches: r.meetingLoad.contextSwitches,
      risk: r.band, // "Low" | "Medium" | "High" | "Critical"
    }));
  }
}
```

### 4.3 Named domain errors (fail-fast, no log-and-continue)

| Error                           | Raised when                                                     | Guards |
| ------------------------------- | --------------------------------------------------------------- | ------ |
| `InvalidSprintWindowError`      | window missing / `start >= end`                                 | I-4    |
| `MissingCalendarDataError`      | an included assignee has no calendar events to derive the triad | I-1    |
| `EventOutsideSprintWindowError` | a calendar event falls outside `[start, end]`                   | I-4    |
| `IncompleteRiskInputsError`     | any triad input cannot be computed for an included assignee     | I-1    |

None of these is caught-and-ignored inside the domain. They surface to the route mapper (§4.5).

### 4.4 Repository — one loader instead of scattered fetches

Today the "assessment" is assembled implicitly across `getSprintAssignees` + the UI. Replace with a
repository that loads **all inputs for the aggregate in one coordinated read**, so the invariant is
evaluated against a single consistent snapshot:

```typescript
// src/lib/domain/sprint-risk-assessment-repository.ts  (NEW — illustrative)

export interface SprintRiskAssessmentRepository {
  /**
   * Loads the sprint window + workload (Jira) and, per assignee, calendar connection
   * state + events within the window (Calendar), then builds and returns the aggregate.
   * Atomicity: gather all inputs first; compute verdicts only once inputs are complete.
   * If a required calendar read fails for an INCLUDED assignee, fail fast (do not emit a
   * partial verdict); an unconnected assignee is simply omitted (I-3).
   */
  load(userId: string, sprintId: number): Promise<SprintRiskAssessment>;
}
```

- **Read atomicity:** the aggregate is computed only after Jira workload + window + all per-assignee
  calendar events are gathered. No verdict is produced from a half-loaded input set.
- **Persistence atomicity (if assessments are ever cached/stored):** any write of assessment rows plus
  its window/summary goes in **one transaction** — either the whole assessment persists or none of it,
  so a reader never sees a sprint with rows computed under a stale window.
- The existing `getSprintAssignees` (`jira-client.ts:259-284`) is demoted to a pure Jira **ingestion**
  helper feeding the repository; it stops being the "answer".

### 4.5 Thin API route — enforcement moves from client to server

```typescript
// src/pages/api/jira/sprints/[sprintId]/risk.ts  (NEW — illustrative)
export const prerender = false;

export const GET: APIRoute = async (context) => {
  const sprintId = parsePositiveInt(context.params.sprintId); // parse input
  if (sprintId === null) return jsonError(400, "Invalid sprint ID.");

  const resolved = await resolveJiraApiContext(context); // reuse existing auth+PAT
  if (resolved instanceof Response) return resolved;

  try {
    const assessment = await repository.load(resolved.user.id, sprintId); // aggregate method
    return json({ sprintId, rows: assessment.toView() }); // bands only (I-2)
  } catch (error) {
    return mapRiskDomainError(error); // named error -> status
  }
};
```

`mapRiskDomainError` maps: `InvalidSprintWindowError` → 422, `MissingCalendarDataError` /
`IncompleteRiskInputsError` → 409, `EventOutsideSprintWindowError` → 500 (internal invariant breach),
`JiraValidationError` → 400 (reuse `jira-api-context.ts:75-80`). The route never computes a verdict and
never returns a raw number as "risk"; the UI stops being a guardian and only renders `rows`.

---

## Step 5 — Before/after, phased plan, tests

### 5.1 Before / after per current rule site

| Site (`path:line`)                                   | Before (today)                                                 | After (refactor)                                                                                |
| ---------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `SprintPicker.tsx:137-158`                           | Table renders story points as the load verdict (I-1/I-2/I-3 ✗) | Renders server-computed `risk` band + meeting hours + context switches; no client verdict logic |
| `jira-client.ts:259-284` `getSprintAssignees`        | Aggregates story points and returns them as the result         | Demoted to Jira workload ingestion feeding the aggregate; no verdict                            |
| `types.ts:51-55` `SprintAssignee`                    | `{ accountId, displayName, totalStoryPoints }`                 | Stays ingestion-only; new `AssigneeRiskRowView` carries the triad + band                        |
| `types.ts:47-48` `startDate/endDate` (unused)        | Fetched, never read (I-4 ✗)                                    | Consumed by `SprintWindow`; boundary enforced in the aggregate                                  |
| `api/jira/sprints/[sprintId]/assignees.ts:19-27`     | Returns story-points DTO                                       | Superseded by `GET .../risk`; old route retired or demoted to internal ingestion                |
| `use-jira-sprint-picker.ts:104-118`                  | Swallows failures into `[]` + generic message                  | Fetches `/risk`; distinguishes "no connected assignees" (partial, I-3) from a real error        |
| `jira-client.ts:39-47` `readStoryPoints` (0 default) | Missing points silently become `0`                             | Still tolerated as workload input, but it is one of three inputs, never the verdict             |
| `auth/google.ts:15-20` (no calendar scope)           | No calendar consent requested (I-6 ✗) — gates I-3              | S-03 prerequisite: request per-user calendar scope so the triad inputs can exist                |

**Honest consequence.** Until S-03 lands, `calendarConnected` is `false` for everyone, so the correct
enforced output is an **empty table** (partial results = none) rather than today's false story-points
table. Enforcing the invariant makes the wrong signal disappear — the intended outcome.

### 5.2 Phased plan (test-first where the project has discipline)

The project has a live Vitest suite and a test plan whose **Phase 3** already targets this exact risk
(qualitative-band correctness, Risk #4; connected-assignee inclusion, Risk #1 — `test-plan.md:42,45,72`).
Phases marked **[test-first]** write the failing test before the code, per §6.1/§6.5 of the test plan.

| Phase | Scope                                                                                                  | Test-first?      | Cheapest layer (test-plan)                                                   |
| ----- | ------------------------------------------------------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------- |
| P0    | Value objects `SprintWindow`, `Workload`, `MeetingLoad`, `RiskBand`; pure `RiskBand.fromTriad` mapping | **[test-first]** | unit — pure function on band-boundary fixtures (Risk #4)                     |
| P1    | Aggregate `SprintRiskAssessment` + named errors + preconditions (`assess`, `toView`)                   | **[test-first]** | unit — legal/illegal transitions                                             |
| P2    | `SprintRiskAssessmentRepository`: Jira ingestion + windowed calendar events; one-snapshot load         | yes              | integration — MSW/fixtures at HTTP edge (Risk #6, #1)                        |
| P3    | Thin `GET /api/jira/sprints/[sprintId]/risk` + `mapRiskDomainError`; secret-scan on responses          | yes              | integration — route handler + `assertResponseBodyHasNoSecretProbe` (Risk #2) |
| P4    | Swap `SprintPicker` to render bands + triad; delete client verdict; loading-state intact               | partial          | e2e loading smoke (Risk #7)                                                  |
| P5    | Retire/inline `getSprintAssignees` + old `assignees` route                                             | regression       | unit + integration                                                           |

**Cross-slice dependency:** P2–P4 require **S-03 (calendar connect)** and the calendar scope from
`google.ts` for the _full_ invariant. P0–P1 (the domain core and its guard) can land immediately and
independently — they are the load-bearing part of this plan.

### 5.3 Test cases for the invariant

**Legal operations (must succeed):**

1. Connected assignee with events inside the window → row with a band computed from the triad.
2. Assignee **without** connected calendar → **omitted** from `rows` (partial results, I-3).
3. Sprint with several connected + several unconnected assignees → only connected ones appear.
4. High meeting hours + many switches + moderate story points → higher band than low-meeting peer with
   identical story points (proves I-1: workload alone does not decide).
5. Event exactly at `start` or `end` boundary → counted (closed-interval boundary).

**Illegal operations (must throw a named error, not fall back):**

6. Included assignee with no calendar events → `MissingCalendarDataError` (never a story-points-only band).
7. Calendar event outside `[start, end]` → `EventOutsideSprintWindowError`.
8. Sprint with missing/invalid window (`start >= end`) → `InvalidSprintWindowError`.
9. Any triad input uncomputable for an included assignee → `IncompleteRiskInputsError`.

**Contract / leakage:**

10. `/risk` response JSON exposes `risk` as a band string and carries **no** numeric "score" field (I-2).
11. `/risk` success **and** error responses contain no PAT/calendar token (`SECRET_PROBE`, Risk #2).

### 5.4 New load-bearing names to register

If the project keeps a contract register (e.g. an AGENTS.md "load-bearing names" section or the domain
distillation), register:

- **Aggregate / entities / VOs:** `SprintRiskAssessment` (root), `AssigneeRiskRow`, `SprintWindow`,
  `RiskBand`, `Workload`, `MeetingLoad`, `AssigneeRiskRowView`.
- **Repository:** `SprintRiskAssessmentRepository` (`load(userId, sprintId)`).
- **Named domain errors:** `InvalidSprintWindowError`, `MissingCalendarDataError`,
  `EventOutsideSprintWindowError`, `IncompleteRiskInputsError`.
- **Route + mapper:** `GET /api/jira/sprints/[sprintId]/risk`, `mapRiskDomainError`.

---

## Constraints honored

- **Fail-fast:** every illegal operation raises a named domain error and stops; no log-and-continue and
  no silent proxy substitution (contrast the current `readStoryPoints` 0-default and the fail-open
  middleware guard).
- **Verified citations only:** all `path:line` references were read during this pass.
- **No production code changed:** signatures and pseudocode above are illustrative design, not edits.
- **Output written to** `context/domain/02-invariant-aggregate-refactor.md` (frontmatter: title, created,
  type: refactor-plan).
