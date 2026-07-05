# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (Cloudflare workerd runtime via Wrangler)
npm run build        # Production build
npm run lint         # ESLint
npm run lint:fix     # ESLint with auto-fix
npm run typecheck    # tsc --noEmit
npm run test         # Vitest full suite (once)
npm run test:watch   # Vitest watch mode
npm run test -- path/to/file.test.ts   # Single test file
npm run test:rls     # RLS two-user isolation tests (requires local Supabase + Docker)
```

Pre-commit hook runs lint-staged (ESLint on `.ts/.tsx/.astro`, Prettier on `.json/.css/.md`, scoped Vitest on staged risk-area files).

## Architecture

**Astro 6 SSR app** (`output: "server"`) with React 19 islands for interactive UI, Tailwind 4, Supabase auth, and shadcn/ui components. Deploys to Cloudflare Workers via `@astrojs/cloudflare`.

### Rendering

All pages are server-rendered. API routes must export `const prerender = false`. React components used for interactivity are mounted with `client:load` directives in `.astro` pages.

### Auth flow

- `src/lib/supabase.ts` — creates a cookie-based Supabase SSR client. Env vars (`SUPABASE_URL`, `SUPABASE_KEY`) are declared server-only in `src/lib/env-schema.ts` and never reach the client.
- `src/middleware.ts` — resolves the current user on every request, attaches to `context.locals.user`. Unauthenticated users are redirected to `/auth/signin`. Authenticated users without a Jira token are kept at `/onboarding` (except `/settings`, which must work without a PAT).
- Google OAuth: `GET /api/auth/google` starts the PKCE flow; `GET /api/auth/callback` exchanges the code and redirects to `/onboarding`.
- Account deletion: `POST /api/account/delete` — uses `createAdminClient()` from `src/lib/supabase-admin.ts` (service-role only; never attach to `context.locals`).

### Integration token security

Per-user credentials (Jira PAT, future Google Calendar OAuth) are AES-encrypted at the application layer before storage in the `integration_tokens` Supabase table. `TOKEN_ENCRYPTION_KEY` is a 32-byte base64 key (generate: `openssl rand -base64 32`). Never log tokens or return decrypted payloads to client UI. `SUPABASE_SERVICE_ROLE_KEY` is required for account deletion and future cross-user reads.

### Dashboard sprint picker

- `src/pages/dashboard.astro` — Astro shell; renders `SprintPicker` as a React island.
- `src/components/dashboard/SprintPicker.tsx` — board/sprint dropdowns, assignee table, full-page spinner, error banner.
- `src/components/hooks/use-jira-sprint-picker.ts` — fetches boards → sprints → assignees; selection is ephemeral React state.
- `src/lib/services/jira-client.ts` — `listBoards`, `listActiveFutureSprints`, `getSprintAssignees` (Jira Agile REST).
- `src/lib/jira-api-context.ts` — shared auth + PAT resolution for Jira JSON routes.

### Jira API routes

All return JSON; require `context.locals.user` and stored Jira PAT. Never return PAT or decrypted token payload.

- `GET /api/jira/boards`
- `GET /api/jira/boards/[boardId]/sprints`
- `GET /api/jira/sprints/[sprintId]/assignees`

### Data layer conventions

- Services and helpers: `src/lib/` or `src/lib/services/`
- Shared DTO/entity types: `src/types.ts`
- React hooks: `src/components/hooks/`
- shadcn/ui components: `src/components/ui/` (add with `npx shadcn@latest add [name]`)
- Use `cn()` from `@/lib/utils` for conditional Tailwind classes
- Database migrations: `supabase/migrations/` with `YYYYMMDDHHmmss_short_description.sql`

## Testing

Vitest (`^4.1.9`) configured via `vitest.config.ts` using Astro's `getViteConfig()`. Tests are colocated with source: `src/lib/foo.test.ts` next to `src/lib/foo.ts`. Shared test helpers live in `src/test/`.

### Key test helpers

- `@/test/mock-api-context` — `createMockApiContext()` / `createMockUser()` for testing Astro middleware and API route handlers without a server.
- `@/test/mock-integration-token-service` — module mock factory for `IntegrationTokenService`; use `mockGetJiraPat`, `mockHasToken` to configure per-test.
- `@/test/mock-supabase-client` — `supabaseClientMockModule()` for mocking `@/lib/supabase`.
- `@/test/mock-server-deps` — `mockAstroEnvServer` for mocking `astro:env/server`.
- `@/test/jira-route-mocks` — `mockJiraFetchSuccess()`, `mockJiraFetchUnauthorized()`, `setupAuthenticatedJiraUser()`.
- `@/test/secret-scan` — `assertNoSecretProbe()`, `assertResponseBodyHasNoSecretProbe()` for token-leakage assertions. Inject `SECRET_PROBE` from `@/test/fixtures` into mock payloads; assert it never appears in output.
- `@/test/rls-fixtures` — `isRlsSuiteEnabled()`, `createSessionClient()`, `signInOrSignUp()` for two-user RLS isolation (runs only with local Supabase + test credentials in `.env`).

### Middleware/route import order

Always mock modules (`vi.mock(...)`) **before** importing the handler under test. Vitest hoists `vi.mock` calls, but handler imports that run side effects on load must come after mock registration.

### RLS tests

`npm run test:rls` requires `npx supabase start` (Docker) plus `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `TEST_USER_B_EMAIL`, `TEST_USER_B_PASSWORD` in `.env`. The suite skips automatically when the environment is not ready. Never point RLS tests at hosted/production Supabase.

## Environment

- Node.js v22.14.0 (see `.nvmrc`)
- Secrets for local dev go in `.dev.vars` (Cloudflare workerd) **and** `.env` (Node/Vitest). Copy `.env.example` to both.
- Required vars: `SUPABASE_URL`, `SUPABASE_KEY`, `TOKEN_ENCRYPTION_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Local Supabase: `npx supabase start` (requires Docker); Studio at `http://localhost:54323`
- Apply migrations: `npx supabase db reset` (local) or `npx supabase db push` (hosted)
- Deploy: `npx wrangler deploy`; set secrets via `npx wrangler secret put`

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs lint + build on every push and PR to `master`. Requires `SUPABASE_URL`, `SUPABASE_KEY`, and `TOKEN_ENCRYPTION_KEY` as repository secrets.
