# Sprint Capacity Intelligence

Dashboard for engineering managers to check Jira sprint capacity at a glance. Sign in with Google, connect a Jira PAT, pick a board and sprint, and see story points totalled per assignee — no manual spreadsheet tallying.

## Features

- Google OAuth sign-in via Supabase Auth
- Guided onboarding to store a Jira PAT (AES-encrypted at rest)
- Board → sprint → assignee drill-down with summed story points
- Account settings with two-step account deletion (purges stored Jira credentials)

## Tech Stack

- [Astro](https://astro.build/) v6 - Server-rendered app shell (SSR, `output: "server"`)
- [React](https://react.dev/) v19 - Interactive islands (sprint picker, settings)
- [TypeScript](https://www.typescriptlang.org/) v5 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 + shadcn/ui - Styling and components
- [Supabase](https://supabase.com/) - Auth (Google OAuth) and Postgres storage for encrypted integration tokens
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime (via `@astrojs/cloudflare`)

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/Marce1ina/sprint-capacity-intelligence.git
cd sprint-capacity-intelligence
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

5. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── assets/ # Static assets
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Initialize the local Supabase project (creates a `supabase/` config folder):

```bash
npx supabase init
```

3. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

4. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
TOKEN_ENCRYPTION_KEY=<generate with: openssl rand -base64 32>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from CLI output>
```

5. Apply migrations and seed (creates `integration_tokens` table):

```bash
npx supabase db reset
```

6. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

### Google OAuth (sign-in)

Sign-in uses Google via Supabase Auth. Configure once for local dev and again in the hosted Supabase project before production deploy.

#### Google Cloud Console

1. Create an OAuth 2.0 **Web application** client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Add **Authorized redirect URIs** pointing at Supabase — **not** your Astro app:
   - Local: `http://127.0.0.1:54321/auth/v1/callback`
   - Hosted: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Copy the client ID and client secret.

#### Supabase (local)

Add to `.env` (read by `supabase start` via env substitution in `supabase/config.toml`):

```
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<google-client-id>
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=<google-client-secret>
```

Restart the local stack after changing credentials:

```bash
npx supabase stop && npx supabase start
```

Local `supabase/config.toml` sets `site_url` to `http://127.0.0.1:4321` (Astro dev port) and allow-lists `http://127.0.0.1:4321/api/auth/callback`.

#### Supabase Dashboard (hosted / production)

1. **Authentication → Providers → Google** — enable and paste the Google client ID and secret.
2. **Authentication → URL Configuration**:
   - **Site URL**: your Cloudflare Workers origin (e.g. `https://sprint-capacity-intelligence.<account>.workers.dev`)
   - **Redirect URLs**: add `https://<your-workers-domain>/api/auth/callback` (and preview branch URLs if testing PR deploys)
3. In Google Cloud, add the hosted Supabase callback URI: `https://<project-ref>.supabase.co/auth/v1/callback`

The Astro app only needs `SUPABASE_URL` and `SUPABASE_KEY` at runtime — Google secrets stay in Supabase config.

### Integration token encryption

Per-user integration credentials (Jira PAT, Google Calendar OAuth tokens) are encrypted at the application layer before storage. Set `TOKEN_ENCRYPTION_KEY` in `.env`, `.dev.vars`, and production Wrangler secrets:

```bash
openssl rand -base64 32
```

| Variable                    | Description                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `TOKEN_ENCRYPTION_KEY`      | 32-byte AES key, base64-encoded (server-only secret)                                                   |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key from Supabase Dashboard → Settings → API (server-only; required for account deletion) |

`SUPABASE_SERVICE_ROLE_KEY` is also used by cross-user calendar reads (roadmap slice S-04).

Verify the token store locally (requires Docker + test user credentials):

```bash
# optional: TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_USER_B_EMAIL, TEST_USER_B_PASSWORD
npx tsx --env-file=.env scripts/verify-integration-tokens.mts
```

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable                    | Description                                                 |
| --------------------------- | ----------------------------------------------------------- |
| `SUPABASE_URL`              | Project URL from Supabase dashboard → Settings → API        |
| `SUPABASE_KEY`              | `anon` public key from Supabase dashboard → Settings → API  |
| `TOKEN_ENCRYPTION_KEY`      | 32-byte AES key, base64-encoded (`openssl rand -base64 32`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key from Supabase dashboard → Settings → API   |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
TOKEN_ENCRYPTION_KEY=<base64-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

### Auth routes

| Route                  | Description                                                               |
| ---------------------- | ------------------------------------------------------------------------- |
| `/auth/signin`         | Google sign-in page ("Continue with Google")                              |
| `/api/auth/google`     | Starts Supabase Google OAuth PKCE flow                                    |
| `/api/auth/callback`   | Exchanges OAuth code for session; redirects to `/onboarding`              |
| `/api/auth/signout`    | Ends session and redirects to `/`                                         |
| `/settings`            | Account settings — email, sign-out, two-step account deletion (auth-only) |
| `/api/account/delete`  | Permanently deletes account and stored data (POST; requires auth)         |
| `/onboarding`          | Jira PAT + site URL setup (requires auth; redirects to `/` if done)       |
| `/api/onboarding/jira` | Validates and saves Jira credentials (POST form)                          |
| `/`                    | Sprint picker — board/sprint selection and assignee story-point totals    |

Route protection and onboarding guards are handled in `src/middleware.ts`.

### Jira API routes

Authenticated JSON endpoints used by the dashboard sprint picker. All require a signed-in user with a stored Jira PAT; responses never include the PAT or decrypted token payload.

| Route                                       | Description                                              |
| ------------------------------------------- | -------------------------------------------------------- |
| `GET /api/jira/boards`                      | Lists accessible Jira boards for the board dropdown      |
| `GET /api/jira/boards/:boardId/sprints`     | Lists active and future sprints for the selected board   |
| `GET /api/jira/sprints/:sprintId/assignees` | Aggregates assignees and total story points for a sprint |

### Jira PAT permissions

The onboarding PAT must be able to **browse** boards, sprints, and issues on the target Jira Cloud site. At minimum:

- Read access to the Jira site (valid email + PAT pair)
- Permission to view Agile boards and sprints the EM can access
- Permission to read issue fields including assignee and story points

Create the token in Jira → **Account settings → Security → API tokens**, then paste it with your Jira site URL during onboarding.

### User journey (dashboard sprint picker)

1. Sign in with Google at `/auth/signin`.
2. Complete onboarding at `/onboarding` with Jira site URL and PAT (skipped if already configured).
3. Open `/` — boards load automatically in the board dropdown.
4. Select a board — active and future sprints appear in the sprint dropdown.
5. Select a sprint — the assignee table shows each person (plus "Unassigned" when applicable) with summed story points.
6. On Jira errors, a banner appears with a retry action; a full-page spinner covers the card during fetches.
7. Board and sprint selection is ephemeral (cleared on page refresh).

Story points are read via the Jira Agile `storyPoints` field alias on sprint issues. This works on default Jira Software scrum boards but is instance-dependent.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

1. Build the project:

```bash
npm run build
```

2. Deploy with Wrangler:

```bash
npx wrangler deploy
```

Set `SUPABASE_URL`, `SUPABASE_KEY`, `TOKEN_ENCRYPTION_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as secrets in your Cloudflare dashboard or via `npx wrangler secret put`.

### Production readiness (account deletion)

Before enabling account deletion in a hosted environment:

- [ ] `SUPABASE_SERVICE_ROLE_KEY` set in Cloudflare Wrangler secrets (and `.dev.vars` locally)
- [ ] End-to-end delete smoke on deployed Worker URL (sign in → `/settings` → two-step delete → signed out on `/`)
- [ ] Confirm no orphaned `integration_tokens` for the deleted test user in hosted Supabase Table Editor
- [ ] Re-sign-in with the same Google account creates a fresh user and shows onboarding

### Production smoke checklist

Before marking a Jira-integrated deploy as ready, verify hosted configuration end-to-end on the live Worker URL (not just locally):

1. **Hosted Supabase** — `integration_tokens` table exists (apply migrations via `npx supabase db push` or SQL Editor) and the EM user has a Jira token row after onboarding.
2. **Google OAuth** — provider enabled in Supabase Dashboard; Site URL and redirect URLs point at the Workers origin.
3. **Cloudflare secrets** — `SUPABASE_URL`, `SUPABASE_KEY`, and `TOKEN_ENCRYPTION_KEY` set on the Worker (`npx wrangler secret list`).
4. **Dashboard flow** — sign in on prod, open `/`, select board → sprint → assignee table loads with story point totals from the real Jira site.
5. **No token leakage** — browser Network tab shows no PAT or decrypted credentials in any `/api/jira/*` response.

## Testing

```bash
npm run test          # Vitest full suite (once)
npm run test:watch    # Vitest watch mode
npm run test:rls      # RLS two-user isolation tests (requires local Supabase + Docker)
```

Tests are colocated with source (`src/lib/foo.test.ts` next to `src/lib/foo.ts`). Shared test helpers live in `src/test/`. `test:rls` skips automatically unless `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `TEST_USER_B_EMAIL`, `TEST_USER_B_PASSWORD` are set in `.env` and the local Supabase stack is running.

## CI

GitHub Actions runs lint + build on every push and PR to `master`. Configure `SUPABASE_URL`, `SUPABASE_KEY`, and `TOKEN_ENCRYPTION_KEY` as repository secrets in GitHub for the build step. `SUPABASE_SERVICE_ROLE_KEY` is not required for CI build but is required at runtime for account deletion.

## License

MIT
