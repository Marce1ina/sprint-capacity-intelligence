# Project review criteria

Hard rules for this repository. Apply these when scoring and choosing `verdict`. Fail the verdict when a change clearly violates a hard rule below.

## Security and tokens

- Never log, print, or return decrypted integration tokens or Jira PATs to client UI, API responses, or logs.
- Integration credentials must be AES-encrypted at the application layer before storage (`TOKEN_ENCRYPTION_KEY` / `IntegrationTokenService`). Do not store plaintext PATs.
- Prefer tests that assert no secret leakage (`assertNoSecretProbe` / secret-probe patterns) on auth and token paths.

## Auth and API routes

- Jira JSON routes require `context.locals.user` and a stored PAT via `jira-api-context` / `IntegrationTokenService.getJiraPat()` — never return the PAT or decrypted payload.
- Prefer auth-gate and IDOR coverage on risky auth, account, and token endpoints.

## Admin / service role

- `createAdminClient()` and `SUPABASE_SERVICE_ROLE_KEY` are only for the account-deletion flow (`POST /api/account/delete`).
- Never attach the service-role client to `context.locals` or ship it to client UI.

## UI stack

- Astro for static content and layout; React only for interactivity (islands with `client:load`).
- No Next.js directives such as `"use client"`.
