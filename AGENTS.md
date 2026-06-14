# Rules for AI

## Hard rules

- **Component choice**: Astro for static content/layout; React only for interactivity.
- **Tailwind classes**: use `cn()` from `@/lib/utils`; do not manually concatenate conditional classes.
- **shadcn/ui**: components live in `src/components/ui/`; add with `npx shadcn@latest add [name]`.
- **API routes**: use uppercase `GET`/`POST` exports and set `const prerender = false`.
- **React constraints**: no Next.js directives (`"use client"` etc.); extract hooks to `src/components/hooks/`.
- **Data layer layout**: services/helpers in `src/lib/` (or `src/lib/services/`), shared DTO/entity types in `src/types.ts`.
- **Migrations**: place in `supabase/migrations/` with `YYYYMMDDHHmmss_short_description.sql`.

## Commands

- `npm run dev` — run local development server.
- `npm run lint` — run ESLint checks.
- `npm run build` — run production build.

## Architecture

**Astro 6 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default. API routes must export `const prerender = false`.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from protected routes. Enforces Jira onboarding: users without a Jira token are kept on `/onboarding`; users with a token skip onboarding.
- Google OAuth: `GET /api/auth/google` starts the flow; `GET /api/auth/callback` exchanges the code and redirects to `/onboarding`. No email/password auth.
- Auth page: `src/pages/auth/signin.astro` (Google sign-in CTA only).
- Onboarding: `src/pages/onboarding.astro` + `POST /api/onboarding/jira`; Jira validation in `src/lib/services/jira-client.ts`; persistence via `IntegrationTokenService.upsertJiraPat()`.
- Sign-out: `POST /api/auth/signout`
- Account settings: `src/pages/settings.astro` — email display, sign-out, two-step account deletion (auth-only; no Jira token required).
- Account deletion: `POST /api/account/delete` — revokes Google Calendar token (when stored), purges `integration_tokens`, deletes auth user via Admin API, signs out, redirects `/`. Uses `createAdminClient()` from `src/lib/supabase-admin.ts` (service role only in this flow — never attach to `context.locals` or client UI).
- Protected pages: `src/pages/dashboard.astro`, `src/pages/onboarding.astro`, `src/pages/settings.astro`

## Environment

- Node.js v22.14.0 (see `.nvmrc`)
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY`, `TOKEN_ENCRYPTION_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev)
- Integration tokens: `src/lib/services/integration-token-service.ts` with schema in `supabase/migrations/*_integration_tokens.sql`. Never log tokens or return decrypted payloads to client UI.
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored)
- Deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth)

## CI

GitHub Actions workflow (`.github/workflows/ci.yml`) runs lint + build on every push and PR to master. Requires `SUPABASE_URL` and `SUPABASE_KEY` repository secrets for the build step.
