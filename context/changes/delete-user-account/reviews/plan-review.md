<!-- PLAN-REVIEW-REPORT -->

# Plan Review: EM Account Deletion and Data Purge

- **Plan**: context/changes/delete-user-account/plan.md
- **Mode**: Deep
- **Date**: 2026-06-14
- **Verdict**: SOUND (was REVISE — triage complete)
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | PASS    |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 8/8 paths ✓, 6/6 symbols ✓, brief↔plan ✓

## Findings

### F1 — Error mapper usage not wired end-to-end

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §6 + Phase 2 §1 + Phase 2 §3
- **Detail**: Phase 1 defines `accountDeletionErrorMessage(code)` with codes like `not_authenticated`, `config_error`, `delete_failed`. Phase 2 redirects to `/settings?error=...` and settings passes the query param to `ServerError`. Existing auth flow encodes human-readable messages at redirect time (`auth-errors.ts` in `callback.ts:21`), and pages pass them through unchanged (`signin.astro:5` → `SignInForm`). If the delete API redirects with raw codes, users see `delete_failed` in the banner.
- **Fix**: In `POST /api/account/delete`, redirect with `encodeURIComponent(accountDeletionErrorMessage('…'))` (match `callback.ts`). Settings page passes the param straight to `ServerError` — no second mapping step.
- **Decision**: FIXED — Fix in plan

### F2 — ServerError requires a React island prop, not Astro markup

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §2 + Phase 2 §3
- **Detail**: `ServerError` is a React component (`ServerError.tsx` uses `lucide-react`). Astro pages cannot render it directly. Sign-in and onboarding both pass `serverError={error}` into a React island (`SignInForm`, `JiraPatForm`). The plan says settings.astro shows errors "via ServerError" but does not specify which island receives the prop.
- **Fix**: Add `serverError?: string | null` to `DeleteAccountForm` (or a small settings wrapper island) and render `<ServerError message={serverError} />` at the top — mirror `SignInForm.tsx:12`.
- **Decision**: FIXED — Fix in plan

### F3 — Onboarding users have no discoverable path to /settings

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 2 §5–§6; Key Decisions (Settings access)
- **Detail**: A core use case is "user stuck on onboarding deletes without Jira PAT." Middleware already allows this once `/settings` is auth-protected (Jira redirects only target `/dashboard` and `/onboarding`). But `Topbar.astro` appears only on the landing page (`Welcome.astro`); dashboard and onboarding use bare `Layout` with no nav. Plan adds Settings to Topbar and an optional dashboard link, but onboarding.astro — the page onboarding-blocked users actually see — gets no link. Deletion works at `/settings` by URL only.
- **Fix A ⭐ Recommended**: Add a subtle "Account settings" link on `onboarding.astro` (footer or below the form).
  - Strength: Matches the stated decision ("auth-only, no Jira required") with visible offboarding for the primary stuck-user path.
  - Tradeoff: One extra line in onboarding UI.
  - Confidence: HIGH — same link pattern already planned for dashboard.
  - Blind spot: None significant.
- **Fix B**: Accept URL-only discoverability for MVP; document in manual test that onboarding users navigate by typing `/settings`.
  - Strength: Smallest diff.
  - Tradeoff: Core offboarding path is hidden from users who need it most.
  - Confidence: HIGH.
  - Blind spot: None.
- **Decision**: FIXED — Fix differently: shared `AppNav.astro` on dashboard, onboarding, and settings; Topbar reuses it

### F4 — Middleware Jira-gate exclusion is optimization, not access fix

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Lean Execution
- **Location**: Critical Implementation Details — Settings route vs Jira gate
- **Detail**: Current middleware only redirects `/dashboard` ↔ `/onboarding` based on Jira token status. Adding `/settings` to `PROTECTED_ROUTES` alone would not block onboarding users. Excluding `/settings` from the `hasToken()` block saves one DB round-trip — good, but the stated rationale ("otherwise users stuck on onboarding cannot reach deletion") overstates necessity.
- **Fix**: Optional — soften rationale to "skip unnecessary hasToken lookup" in plan text. Implementation is still correct.
- **Decision**: SKIPPED

### F5 — Hosted checklist aligns with lessons learned ✅

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Blind Spots
- **Location**: Phase 3
- **Detail**: Phase 3 explicitly adds a Production readiness checklist for `SUPABASE_SERVICE_ROLE_KEY` — directly addresses the F-01/S-01 lesson. No action needed.
- **Decision**: DISMISSED
