---
project: sprint-capacity-intelligence
researched_at: 2026-05-28
recommended_platform: Cloudflare Workers (Static Assets)
runner_up: Render
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 (+ React islands)
  runtime: Cloudflare Workers (workerd) via @astrojs/cloudflare v13
---

## Recommendation

**Deploy on Cloudflare Workers with Static Assets** (not legacy Cloudflare Pages).

This matches the bootstrapped stack (`@astrojs/cloudflare` ^13.5, `wrangler` ^4.90, `output: "server"`), the tech-stack hand-off (`deployment_target: cloudflare-pages` — Astro 6 maps this to Workers), and your interview answers: stateless request/response (Q1), external Supabase (Q5), single-region users (Q4). Cost and DX were neutral (Q2); AWS familiarity (Q3) is noted as an operational gap, but re-platforming for a 3-week MVP would cost more than learning Wrangler. Render tied on agent-friendly criteria but requires swapping to `@astrojs/node`; staying on the existing adapter avoids migration risk before the 2026-06-30 deadline.

## Platform Comparison

| Platform   | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
| ---------- | --------- | ------------------ | ------------------- | ----------------- | ----------------- | ----- |
| Cloudflare | Pass      | Pass               | Pass                | Pass              | Pass              | 5/5   |
| Render     | Pass      | Pass               | Pass                | Pass              | Pass              | 5/5   |
| Vercel     | Pass      | Pass               | Pass                | Partial           | Partial           | 4/5   |
| Railway    | Pass      | Pass               | Pass                | Partial           | Pass              | 4/5   |
| Netlify    | Partial   | Pass               | Pass                | Partial           | Pass              | 3.5/5 |
| Fly.io     | Pass      | Partial            | Partial             | Pass              | Partial           | 3/5   |

**Cloudflare** — `wrangler` covers deploy, rollback, tail, and secrets. Docs ship as `llms.txt` plus GitHub markdown. Astro 6 + adapter v13 targets Workers natively; this repo already has `wrangler.jsonc` with `assets.directory` and `nodejs_compat`. Free tier (~100k requests/day) covers MVP traffic; paid Workers from $5/mo if CPU limits bite. Supabase stays external; Hyperdrive optional for Postgres pooling later.

**Render** — Equal agent score (`llms.txt`, GA MCP, `render` CLI). Strong for Astro SSR on Node Web Services ($0 with spin-down or $7/mo always-on). Loses to Cloudflare here only because the project is already wired for Workers—switching adapters mid-MVP adds risk without solving a hard constraint.

**Vercel** — Excellent Astro support and `llms.txt`. Partial scores: Hobby rollback is one step only; Vercel MCP is public beta (May 2026). Requires `@astrojs/vercel` migration from current Cloudflare adapter.

**Railway** — Strong `llms.txt` and GA MCP; usage-based pricing (~$5–15/mo typical). Rollback is dashboard-driven; Astro SSR needs `@astrojs/node` and careful `PORT`/`0.0.0.0` binding.

**Netlify** — Good Astro + official Netlify MCP, but no CLI rollback (UI only) and credit-based pricing with site pause on exhaustion.

**Fly.io** — Persistent Machines and WebSockets, but no free tier, no official `llms.txt`, and container ops (`@astrojs/node`) — heavier than MVP needs.

### Shortlisted Platforms

#### 1. Cloudflare Workers + Static Assets (Recommended)

Wins on perfect criteria score **and** zero adapter migration. Repo ships `astro.config.mjs` with `adapter: cloudflare()`, `wrangler.jsonc` using Workers Static Assets, and `compatibility_flags: ["nodejs_compat"]`. GitHub Actions (lint+build) is in `.github/workflows/ci.yml`; Cloudflare Workers Builds (GitHub integration) is planned for auto-deploy—operational story below assumes Wrangler secrets plus GitHub-connected Builds.

#### 2. Render

Tied 5/5 on agent-friendly criteria. Best fallback if Cloudflare CPU limits or edge Supabase patterns block sprint aggregation. Gap: replace `@astrojs/cloudflare` with `@astrojs/node`, deploy as Web Service, reconfigure secrets and CI.

#### 3. Vercel

Strong Astro/SSR docs and marketplace Supabase integration. Gap vs. recommendation: adapter swap, MCP still beta, Hobby rollback limited—acceptable runner-up if team rejects Cloudflare ops model.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **CPU time ceiling** — Free tier ~10 ms CPU per invocation; multi-source sprint aggregation (Jira + Calendar per assignee) can exceed limits without batching/caching.
2. **Supabase on the edge** — `@supabase/supabase-js` works but differs from Node; heavy server SQL may need Hyperdrive + `pg` instead of the JS client.
3. **Pages vs Workers documentation drift** — Older guides reference `wrangler pages deploy`; Astro 6 + adapter v13 requires `wrangler deploy` to Workers.
4. **Cloudflare Workers Builds not yet wired** — Tech-stack assumes auto-deploy on push to `master` via GitHub integration; connecting the repo in the Cloudflare dashboard is still TODO.
5. **AWS familiarity mismatch** — Team comfort is AWS; Cloudflare isolates, bindings, and Wrangler differ from Lambda/ECS debugging habits.

### Pre-Mortem — How This Could Fail

The team shipped Astro SSR on Cloudflare Workers with Supabase auth and Cloudflare Workers Builds connected to GitHub. Early deploys worked for sign-in and static pages. Under real sprint loads, risk computation timed out: sequential Jira and Google Calendar calls in one Worker invocation blew the CPU limit, and users saw opaque 5xx errors despite the PRD’s “show progress after 2s” rule. Nobody configured Hyperdrive; server routes used Supabase’s JS client with subtle cookie/session bugs at the edge. Preview URLs from branch deploys were documented as “Pages” while production used Workers, so agents and humans ran different Wrangler commands. When an EM’s Jira PAT rotated, secrets lived only in the Cloudflare dashboard—no runbook, and Builds-triggered deploys overwrote env vars. Six months in, the team considered re-platforming to Render “for a normal Node server,” paying a three-week migration tax that the MVP deadline had been meant to avoid.

### Unknown Unknowns

- **`nodejs_compat` bundle size** — Already enabled in `wrangler.jsonc`; increases cold-start footprint—monitor bundle size on deploy.
- **Auto-provisioned session KV** — Astro Cloudflare adapter may expect KV bindings; misaligned `wrangler.jsonc` blocks deploy until bindings match adapter output.
- **I/O vs CPU accounting** — Waiting on Jira/Calendar APIs doesn’t consume CPU the same way as compute, but total request duration still has platform limits; long pipelines may need Queues (GA) or chunked responses with progress UI.
- **Preview deploy parity** — Confirm branch/PR preview behavior for GitHub before promising stakeholder demos; Workers preview aliases evolved after Pages-era workflows.
- **Supabase region vs Worker PoP** — Single-region users are fine, but default global Workers can add cross-region latency to Supabase if project region isn’t aligned with primary user geography.

## Operational Story

- **Preview deploys**: Connect GitHub repo to Cloudflare (Workers Builds) or run `npx wrangler deploy` from CI on non-default branches; each deployment gets a unique Workers URL (`*.workers.dev` or custom hostname). Protect preview URLs with Cloudflare Access if demos contain real sprint data. Verify fork-PR behavior in GitHub settings before relying on external contributor previews.
- **Secrets**: Production/staging secrets via `npx wrangler secret put SUPABASE_URL` and `SUPABASE_KEY` (maps to Astro `env` schema in `astro.config.mjs`). GitHub Actions uses repository secrets (`SUPABASE_URL`, `SUPABASE_KEY`) for lint+build; Cloudflare Workers Builds reuses Wrangler secrets at deploy time—never commit secrets. Jira PAT and OAuth tokens belong in Wrangler secrets or Supabase vault columns, not in the repo. Rotation: update Wrangler secret + redeploy; document PAT rotation for EMs separately.
- **Rollback**: `npx wrangler deployments list` → `npx wrangler rollback [VERSION_ID]` — typically minutes to revert Worker code. Database migrations (Supabase) do not roll back with Worker rollback—plan migrations separately.
- **Approval**: Human should approve production deploy merges and primary secret rotation; agents may run `npm run build`, `npx wrangler deploy --dry-run` (if used), tail logs, and read deployment lists. Agents should not drop Supabase tables or rotate production secrets without explicit user confirmation.
- **Logs**: `npx wrangler tail` for live Worker logs; Cloudflare dashboard Observability (enabled in `wrangler.jsonc`) for traces. In CI, stream GitHub Actions workflow logs and Cloudflare Builds output in the dashboard. Cloudflare MCP servers (docs, Workers) available for agent tooling per [MCP catalog](https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/).

## Risk Register

| Risk                                                 | Source                              | Likelihood | Impact | Mitigation                                                                                                                                                               |
| ---------------------------------------------------- | ----------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sprint aggregation exceeds Worker CPU limit          | Devil's advocate                    | M          | H      | Parallelize external API calls; cache Jira sprint snapshot; return partial results with progress UI per PRD NFR                                                          |
| Edge Supabase session/cookie bugs                    | Devil's advocate / Unknown unknowns | M          | M      | Follow `@supabase/ssr` patterns in middleware; spike auth on Workers before Jira/Calendar work                                                                           |
| Wrong deploy command (`pages` vs `workers`)          | Devil's advocate                    | M          | M      | Document `npm run build && npx wrangler deploy` only; ban `wrangler pages deploy` in CI                                                                                  |
| Cloudflare Builds / GitHub integration misconfigured | Devil's advocate / Pre-mortem       | H          | M      | Connect GitHub repo via Workers Builds; keep `.github/workflows/ci.yml` for lint+build; store `SUPABASE_*` in GitHub repository secrets and Wrangler secrets for runtime |
| Jira PAT rotation without runbook                    | Pre-mortem                          | M          | M      | Store PAT as Wrangler secret; add EM-facing “reconnect Jira” flow before sprint analysis                                                                                 |
| Supabase cross-region latency                        | Unknown unknowns                    | L          | M      | Create Supabase project in same region as primary users (single-region MVP)                                                                                              |
| Preview URL leaks sprint data                        | Research finding                    | L          | H      | Cloudflare Access on preview hostnames or synthetic data in preview env                                                                                                  |

## Getting Started

Stack pins: Astro ^6.3, `@astrojs/cloudflare` ^13.5, Wrangler ^4.90. Astro 6 dev/preview runs on real `workerd`—use `npm run dev`; do not add a separate legacy Pages dev server.

1. **Authenticate Wrangler** (one-time): `npx wrangler login`
2. **Local development**: `npm run dev` — Astro 6 + Cloudflare adapter serves with Workers runtime fidelity
3. **Set secrets** (per environment): `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`
4. **Production deploy**: `npm run build` then `npx wrangler deploy` (uses existing `wrangler.jsonc` — Workers Static Assets, not `wrangler pages deploy`)
5. **Cloudflare Workers Builds** (planned): connect GitHub repo in the Cloudflare dashboard; configure build (`npm ci && npx astro sync && npm run build`) and deploy (`npx wrangler deploy`) on push to `master`; GitHub Actions in `.github/workflows/ci.yml` stays lint+build only per tech-stack hint

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup (Cloudflare Workers Builds + GitHub integration wiring)
- Production-scale architecture (multi-region HA, DR)
- AWS deployment paths (team familiarity noted; not in MVP candidate pool)
