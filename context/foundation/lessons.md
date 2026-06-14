# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Surface implicit cost before scoping external services

- **Context**: All lifecycle phases when scoping external services (Google, Jira, Cloudflare, Supabase, and similar third-party APIs).
- **Problem**: During planning, Google Calendar integration appeared routine but carries paid API / quota implications that were not surfaced early — leading to surprise cost and rework expectations.
- **Rule**: Before recommending or planning any external service integration, explicitly call out implicit costs: paid API tiers, quota limits, required billing accounts, per-seat/per-request pricing, and infra charges. Flag "free for sign-in ≠ free for API usage" when OAuth and API access are separate.
- **Applies to**: plan, plan-review, research

## Ship a hosted-environment checklist when PRD features touch external config

- **Context**: Any change that adds Supabase schema, auth providers (OAuth), or runtime secrets — especially when a prior deploy plan assumed a simpler stack (auth-only, no migrations).
- **Problem**: F-01/S-01 shipped code and README docs, but hosted Supabase stayed empty (no `integration_tokens`), Google OAuth was disabled, and Site URL pointed at localhost. Production failed with generic errors until manual dashboard/CLI fixes — even though `TOKEN_ENCRYPTION_KEY` was already set from F-01.
- **Rule**: When a slice depends on hosted Supabase, Google Cloud, or Wrangler secrets, add an explicit **Production readiness** checklist to the plan (or update the deploy plan): apply migrations to hosted DB (`db push` or SQL Editor), enable auth providers + URL config in Supabase Dashboard, set any new runtime secrets, then run end-to-end smoke on the prod URL. Never mark "migration already applied" or "manual setup documented" as done without verifying hosted state — local `db reset` does not update prod.
- **Applies to**: plan, plan-review, implement, impl-review
