---
title: Architecture Report — 10xArchitect (Module 4)
author: Marcelina Kucięba
created: 2026-07-12
type: architecture-summary
---

# Architecture Report — 10xArchitect (Module 4)

> Two-pager synthesized **only** from the five course artifacts below. No facts are invented; gaps are stated explicitly. Every structural claim (counts, "only here") is anchored to an artifact, not to memory of the code.

**Artifact → repository map** (each input arose in a different codebase for L5):

| Level  | Artifact                                                                                                | Repository                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **L2** | `context/map/repo-map.md`                                                                               | **olx-fe-platform**                                                                 |
| **L3** | `context/changes/tracking-architecture/research.md`                                                     | **olx-fe-platform**                                                                 |
| **L4** | `context/changes/refactor-opportunities/plan.md`                                                        | **olx-fe-platform**                                                                 |
| **L5** | `context/domain/{01-domain-distillation, 02-invariant-aggregate-refactor, 03-anti-corruption-layer}.md` | **10x-sprint-load** (dir `10x-sprint-load`; product "Sprint Capacity Intelligence") |

---

## 1. Projects described

**A. olx-fe-platform** — appears at **L2, L3, L4**.

- _Stack:_ Nx monorepo, TypeScript/React; app shell `app/core` (Remix-style `root.tsx` / `entry.client.tsx` / `routes.ts`), buyer verticals, platform libs `libs/*`, Apollo GraphQL, `@libs/ninja-tracking` (L2 §1).
- _Scale (approx.):_ 479 commits / ~3,500 file touches over 12 months (2025-07-11 → 2026-07-10); import graph of **718 modules** (L2 header, §7). ~40% of activity in `buyer-ad-goods` + `buyer-shared` (L2 §1–2).

**B. 10x-sprint-load** ("Sprint Capacity Intelligence") — appears at **L5**.

- _Stack:_ Astro 6 SSR + React 19 islands, Tailwind 4, Supabase auth, Cloudflare Workers; Vitest (L5/01:29).
- _Scale (approx.):_ early-stage. Only slices **F-01, S-01, S-02, S-05 done**; the core (S-03 calendar connect, S-04 per-person risk table = north star) is `proposed`/not built (L5/01:41-44). Single persistence table/migration; **11 production files bind Supabase** (L5/03 Step 1). _No commit-count in artifacts — scale stated qualitatively._

---

## 2. Project map (L2 — olx-fe-platform)

1. **Product center ≠ folder symmetry.** `buyer-ad-goods` + `buyer-shared` = ~40% of touches; `app/core/src` has the most commits (96) but only ~5% of touches — an integration layer, not where features land (L2 §1–2).
2. **Local center / integration contract:** `root.tsx` — 40 touches, hub for 45 co-changing modules (L2 §2, §6).
3. **Entry points (first-day path):** `root.tsx` → `entry.client.tsx` → `routes.ts` → `buyer-routes`; top-down wiring holds, **0 cycles** repo-wide (L2 §3, §6).
4. **Risk zones:** `buyer-shared/src/ui/index.ts` barrel fan-out **62**; `libs/config/types.ts` fan-in **68**; `Ad.tsx` assembler (12 deps, no dedicated test); DI breaches `apollo-2→auth` and `ninja-tracking→cookies` (L2 §4).
5. **Unknowns:** Helm/K8s, Terraform, `runProdServer.js` sit **outside** the TS import graph; buyer domain UI has **no single owner**; PR business intent not captured (L2 §7).

---

## 3. Feature analysis (L3 — olx-fe-platform)

**Flow studied & why:** the end-to-end **tracking flow** (`@libs/ninja-tracking`). Chosen to probe the map's flagged **`ninja-tracking → cookies` DI violation** (L2 risk zone #4) and the **`Ad.tsx` no-test** gap (risk zone #3) — L3 states this link in its Research Question.

**Overview (where input → state → output):** Input arrives at bootstrap in `entry.client.tsx` (OneTrust → auth → `createTracker`, before hydration) and thereafter from navigation and user clicks (L3 steps 1–8, 16–21). State lives in a module-singleton tracker plus browser surfaces — `window.dataLayer`, session / `device_id` / Laquesis cookies (L3 read/write table). Output = pushes onto `window.dataLayer` consumed by the external `ninja-cee.js`; FFS owns all page-views/events (`disableDefaultTrackPage: true`) across a four-layer stack (config → engine → bootstrap/DI → domain → thin vertical) (L3 §Feature Overview).

**Top technical-debt risks:**

1. **Fragile coupling — `ninja-tracking → cookies` (DI breach). ✅ ast-grep confirmed** (L3 claim #4: `cookieStorage` at `sessionManager.ts:1,14,21` + `useLaquesisCookies.ts:2,18-19`). Engine lib depends directly on `@ffs/cookies` instead of injected ports.
2. **Test gap — `Ad.tsx` has no route test. ✅ confirmed** (L3 claim #20: 0 `Ad.test.tsx` files). Assembler stacks 12+ deps; loader 404/error/not-found branches unverified.
3. **Blast radius.** `buyer-ad-goods ↔ buyer-shared` = **49** shared commits (git-verified, claim #29); UI barrel fan-out **62** (#24); `libs/config/types.ts` fan-in **68** (#25) — schema/contract changes ripple across four layers.

---

## 4. Refactoring plan (L4 — olx-fe-platform)

**Chosen option (Rank 1 / C1):** make the tracking engine **cookie-agnostic**. `app/core` owns all cookie I/O and injects a `SessionManager` at bootstrap; Laquesis hydration moves to app-core beside `root.tsx`. _Target shape:_ zero `@ffs/cookies` imports in `@libs/ninja-tracking`; `createTracker` receives an injected `sessionManager`; session logic in `app/core/src/tracking/createAppSessionManager.ts`; `useLaquesisCookies` owned by app-core (L4 Overview, Desired End State).

**Consciously NOT doing:** C2 (OneTrust `useTracking` decouple), C3 (legacy `libs/tracking/` removal), extra N3/N5/N6 test coverage, consent-gated Laquesis reads, permanent re-export shims (L4 "What We're NOT Doing").

**Phases (one line each · verification):**

- **P1 — App-core mechanism + co-located tests** (impl + characterization; lib untouched). _Auto:_ nx `test:unit` app-core & ninja-tracking, `ts:check`, `rg` local-import check · _Manual:_ files exist, prod still on lib paths.
- **P2 — Wire Laquesis at bootstrap** (`root.tsx` imports app-core; lib export `@deprecated`). _Auto:_ `test:unit`, `ts:check`, `rg` root import · _Manual:_ app boots, Laquesis hydrates.
- **P3 — Engine port + session wiring (mechanism live)** (extract `SessionManager` port; `buildTrackerConfig` injects; dual API in `createTracker`). _Auto:_ `test:unit`, `ts:check`, `rg` port field · _Manual:_ `session_start` fires + Laquesis hydration = mechanism gate.
- **P4 — Enforcement** (delete lib impls/tests, remove deprecated API + `@ffs/cookies` dep). _Auto:_ `rg` zero `@ffs/cookies`, clean `package.json`, lint, tests · _Manual:_ browser re-verify; **gated** on P3 passing.

---

## 5. Domain per DDD (L5 — 10x-sprint-load)

**Ubiquitous language (key terms):** Sprint Capacity / Focus Capacity · Attention Fragmentation (core insight) · Overload Risk expressed as bands Low/Medium/High/Critical · Context Switch · Sprint Assignee · Integration Token (L5/01 Step 1).

**Biggest model-vs-code divergences:** the entire **Core subdomain is absent from code** (L5/01 Step 4). Notably: per-person risk from workload + meeting hours + context switches → **NOT IN CODE**, the one output surface shows _Name + Story Points only_ (D-1); story points are _explicitly declared insufficient_ yet are the only computed signal (D-2); the table should list only calendar-connected assignees but lists _all_ Jira assignees (D-3); the sprint window (`startDate/endDate`) is fetched but never consumed (D-5).

**Invariant #1 + its aggregate:** **I-1** — "an assignee's overload risk is derived from the triad {workload, meeting hours, context switches} — never workload alone" (with edges I-2 band-only, I-3 calendar-connected-only, I-4 within window). Owning aggregate: **`SprintRiskAssessment`** (root; owns a `SprintWindow` value object + `AssigneeRiskRow[]`). Status today: **VIOLABLE** — enforced nowhere server-side; the shipped UI actively contradicts it (L5/02 Steps 1–2, §4).

**Anti-Corruption Layer — leaking dependency:** **Supabase** (`@supabase/ssr` + `@supabase/supabase-js`). It leaks across **4 layers** (middleware, API routes, service/domain, ambient types) over **7 production files** (11 total incl. routes): `SupabaseClient` is injected into the domain `IntegrationTokenService` constructor and the vendor `User` type _is_ the app-wide `App.Locals.user` (L5/03 Steps 1–2). Proposed fix: one ACL package (`src/lib/acl/supabase/`) behind `AuthGateway` / `AccountAdminGateway` / `TokenRepository` ports.

---

## 6. Decisions that were mine

_The artifacts record each choice with its justification but not a separate deliberation log; below reflects the human-owned selections evidenced in them — personal rationale beyond the stated justifications is the author's to confirm._

AI generated the evidence, citations, layer maps, option lists and rankings; the judgment calls were mine. I chose to research the **tracking flow** rather than another risk zone, following the map's flagged `ninja-tracking → cookies` breach (L3). I ranked **C1 (cookie DI)** as the first refactor and deliberately deferred C2/C3 and extra test coverage, keeping the change small, revertible, and enforcement-gated (L4). In the DDD exercise I selected **I-1 / `SprintRiskAssessment`** as invariant #1 over the already-`ENFORCED` token/account invariants because it is simultaneously most-core and most-weakly-enforced, and I accepted its honest consequence — an _empty_ risk table until S-03 lands, rather than the current false story-points signal (L5/02). For the ACL I picked **Supabase** as the worst leak and ruled out Jira and UI libs on evidence (L5/03).
