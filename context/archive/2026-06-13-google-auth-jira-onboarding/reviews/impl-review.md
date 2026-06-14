<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Google Sign-in and Jira PAT Onboarding

- **Plan**: context/changes/google-auth-jira-onboarding/plan.md
- **Scope**: All 3 phases (d201228, a71a444, 133ec02)
- **Date**: 2026-06-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 1 critical, 4 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | FAIL    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — User-supplied siteUrl can exfiltrate PAT during validation

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/jira-client.ts:26-35, src/pages/api/onboarding/jira.ts:25-26
- **Detail**: `validateJiraCredentials` fetches any user-supplied HTTPS origin and sends `Authorization: Basic base64(email:pat)`. Client-side validation in `JiraPatForm` accepts arbitrary `https://` URLs. A malicious or mistyped URL transmits the PAT outside the Atlassian trust boundary.
- **Fix**: Add server-side host allowlist (e.g. hostname ends with `.atlassian.net`, reject IP literals/private ranges) in `normalizeSiteUrl` or a dedicated validator; call it from both `jira-client.ts` and `jira.ts` before fetch. Align client validation with the same rule.
  - Strength: Closes credential exfiltration class; matches plan intent (Atlassian Cloud base URL only).
  - Tradeoff: Blocks self-hosted Jira — acceptable per PRD/roadmap (Jira Cloud only).
  - Confidence: HIGH — standard pattern for integration URL validation.
  - Blind spot: None significant.
- **Decision**: FIXED — Fix now (host allowlist in `src/lib/jira-site-url.ts`)

### F2 — Local config.toml missing production Workers redirect URL

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/config.toml:156-159
- **Detail**: Plan contract requires `additional_redirect_urls` to include production Workers wildcard. Only local `4321` URLs are present. Hosted production is documented for Supabase Dashboard instead.
- **Fix**: Add Workers callback URL(s) to `additional_redirect_urls`, or amend plan to note production redirects are Dashboard-only.
- **Decision**: FIXED — Fix now (production Workers redirect URLs added to config.toml)

### F3 — Middleware fail-open on hasToken() errors

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:44-48
- **Detail**: PostgREST/DB errors during `hasToken()` allow authenticated users without a Jira token to reach `/dashboard`. Matches plan's documented degraded guard, but is a deliberate authz bypass during outages.
- **Fix A ⭐ Recommended**: Accept as documented MVP tradeoff; add monitoring for token-check failures.
  - Strength: Matches approved plan; avoids blocking all users on transient DB blips.
  - Tradeoff: Brief onboarding bypass possible during DB errors.
  - Confidence: HIGH — explicitly planned behavior.
  - Blind spot: No alerting exists yet.
- **Fix B**: Fail-closed for `/dashboard` — redirect to `/onboarding` or generic error when check fails.
  - Strength: Stricter authz during outages.
  - Tradeoff: Degrades UX when Supabase is flaky.
  - Confidence: MEDIUM — product decision.
  - Blind spot: None significant.
- **Decision**: ACCEPTED — Fix A (documented MVP fail-open; existing console.error monitoring sufficient)

### F4 — OAuth callback ignores provider error params

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/callback.ts:7-11
- **Detail**: Handler only reads `code`. OAuth failures often return `?error=` without `code`, surfacing generic "Missing authorization code" instead of a readable provider error (Phase 1 manual criterion).
- **Fix**: Read `error` / `error_description` query params first; redirect to `/auth/signin?error=` with a safe mapped message.
- **Decision**: SKIPPED

### F5 — Raw Supabase error messages in redirect URLs

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/callback.ts:20, src/pages/api/auth/google.ts:22-23
- **Detail**: Provider/config errors are forwarded via `error.message` in query strings, which may appear in browser history or referrer logs.
- **Fix**: Map known auth errors to fixed user-facing strings; avoid passing through raw provider messages.
- **Decision**: FIXED — Fix now (`src/lib/auth-errors.ts` maps provider errors to safe strings)

### F6 — Jira fetch has no timeout

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Reliability
- **Location**: src/lib/services/jira-client.ts:29-35
- **Detail**: External `fetch` to Jira has no abort/timeout. Slow upstream can hold the Worker until platform limits.
- **Fix**: Wrap fetch in `AbortSignal.timeout(10_000)` and map timeout to `JiraValidationError`.
- **Decision**: FIXED — Fix now (10s AbortSignal.timeout on Jira fetch)

### F7 — hasToken() DB lookup on every protected request

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Performance
- **Location**: src/middleware.ts:32-35
- **Detail**: One DB round-trip per authenticated request to `/dashboard` or `/onboarding`. Acceptable for MVP per plan.
- **Fix**: Defer — cache or session flag when traffic warrants.
- **Decision**: ACCEPTED — defer per MVP plan (no code change)

### F8 — PAT input missing autocomplete hint

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/onboarding/JiraPatForm.tsx:77-88
- **Detail**: PAT field lacks `autoComplete="new-password"`; browsers may offer to save the API token.
- **Fix**: Set `autoComplete="new-password"` on the PAT input via `FormField`.
- **Decision**: SKIPPED
