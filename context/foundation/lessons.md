# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Surface implicit cost before scoping external services

- **Context**: All lifecycle phases when scoping external services (Google, Jira, Cloudflare, Supabase, and similar third-party APIs).
- **Problem**: During planning, Google Calendar integration appeared routine but carries paid API / quota implications that were not surfaced early — leading to surprise cost and rework expectations.
- **Rule**: Before recommending or planning any external service integration, explicitly call out implicit costs: paid API tiers, quota limits, required billing accounts, per-seat/per-request pricing, and infra charges. Flag "free for sign-in ≠ free for API usage" when OAuth and API access are separate.
- **Applies to**: plan, plan-review, research
