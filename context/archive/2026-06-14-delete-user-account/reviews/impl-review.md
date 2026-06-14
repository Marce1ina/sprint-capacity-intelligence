<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: EM Account Deletion and Data Purge

- **Plan**: context/changes/delete-user-account/plan.md
- **Scope**: All 3 phases
- **Date**: 2026-06-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## Findings

### F1 — Destructive delete API lacks CSRF protection

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/account/delete.ts:11
- **Detail**: Two-step confirmation is client-only (`DeleteAccountForm` armed state). The API accepts any authenticated `POST` with no server-issued confirmation token. A cross-site form POST could trigger irreversible deletion without the user clicking "Yes, delete permanently". Same pattern exists on sign-out/Jira routes, but impact here is permanent data loss. SameSite=Lax session cookies may mitigate cross-origin POST in practice, but the endpoint has no explicit CSRF guard.
- **Fix A ⭐ Recommended**: Add a one-time server nonce (generated on `/settings`, embedded as hidden field, validated in delete handler).
  - Strength: Explicit server-side proof the user initiated deletion from the settings page.
  - Tradeoff: Small amount of session/state plumbing.
  - Confidence: HIGH — standard pattern for destructive native-POST flows.
  - Blind spot: Haven't verified Supabase cookie SameSite settings in this deployment.
- **Fix B**: Accept risk for MVP; document as known limitation
  - Strength: No code change; matches existing native-POST routes.
  - Tradeoff: Irreversible action remains CSRF-exposed if cookie policy changes.
  - Confidence: MEDIUM — Lax cookies likely block most cross-site POST today.
  - Blind spot: Future auth/cookie config changes.
- **Decision**: ACCEPTED via Fix B — accept CSRF risk for MVP; document as known limitation

### F2 — signOut failure masks successful account deletion

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/account/delete.ts:53-56
- **Detail**: If `admin.deleteUser()` succeeds but `supabase.auth.signOut()` throws, the outer `catch` redirects to `/settings?error=delete_failed`. The account is already deleted but the user sees a failure message and may retry (hitting `delete_failed` again on a ghost session).
- **Fix**: Wrap `signOut()` in its own try/catch after successful `deleteUser`; always redirect to `/` once the auth user is removed.
- **Decision**: FIXED — wrap signOut in try/catch after successful deleteUser

### F3 — Pending manual success criteria

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/delete-user-account/plan.md (Progress §2.6, §3.4, §3.5)
- **Detail**: Three manual verification items remain unchecked while adjacent items are marked complete: (2.6) failed delete with unset service role shows safe error and preserves tokens; (3.4) production/staging delete smoke; (3.5) production re-sign-in after delete. Automated checks (`npm run lint`, `npm run build`) pass. Per lessons learned, hosted-env checklist items should not be rubber-stamped without hosted verification.
- **Fix**: Run the three pending manual steps and update Progress checkboxes; for 3.4/3.5, complete on deployed Worker URL with `SUPABASE_SERVICE_ROLE_KEY` set in Wrangler secrets.
- **Decision**: FIXED — user verified manual steps 2.6, 3.4, 3.5; Progress checkboxes updated

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: AGENTS.md:41
- **Detail**: Dashboard section still says "Astro shell with sign-out" but inline sign-out was removed; sign-out now lives in `AppNav` on dashboard, onboarding, and settings. Middleware bullet (line 30) also omits the `/settings` Jira-gate exclusion documented in the plan.
- **Fix**: Update dashboard line to reference `AppNav`; add note that `/settings` is auth-gated but excluded from Jira onboarding redirect.
- **Decision**: FIXED — AGENTS.md updated with AppNav and /settings Jira-gate exclusion

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/account/DeleteAccountForm.tsx:35-42
- **Detail**: Plan specified `cn()` for conditional classes (none used — branching via `if (!armed)` instead). Final submit uses plain `Button` without pending/disabled state; `JiraPatForm` uses `SubmitButton` with `useFormStatus` to prevent double-submit during slow POSTs. Cancel button adds hardcoded Tailwind overrides on `variant="outline"`.
- **Fix**: Add pending/disabled state on destructive submit (adapt `SubmitButton` or equivalent); optionally simplify Cancel to `variant="outline"` without custom classes.
- **Decision**: SKIPPED

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/account/delete.ts:54-56
- **Detail**: Outer `catch` redirects to safe user message but logs nothing. Google token read path (lines 37-39) and `google-revoke.ts` do log failures. Ops cannot distinguish config, network, or Supabase admin errors in server logs.
- **Fix**: Log a generic `"Account deletion failed"` with error message only (no tokens/PII), matching the Google revoke pattern.
- **Decision**: FIXED — outer catch logs generic failure message without PII
