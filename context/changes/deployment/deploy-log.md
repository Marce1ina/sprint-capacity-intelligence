---
project: sprint-capacity-intelligence
deployed_at: 2026-06-05
worker_url: https://sprint-capacity-intelligence.marcelina-kucieba.workers.dev
version_id: 4f436e64-eb0f-4aa1-bcf2-a32c8caec1c1
account_id: 01068d93bd21b23c479efe5dcc107eb7
kv_session_id: 83274fef784b4da4af3dc4ea9401e8e4
---

# First deploy log

## Completed

| Step                      | Result                                                        |
| ------------------------- | ------------------------------------------------------------- |
| `wrangler.jsonc` rename   | `sprint-capacity-intelligence`                                |
| SESSION KV binding        | `83274fef784b4da4af3dc4ea9401e8e4` pinned in `wrangler.jsonc` |
| `npm run build`           | Success                                                       |
| `npx wrangler deploy`     | Success                                                       |
| Smoke: `GET /`            | 200                                                           |
| Smoke: `GET /auth/signin` | 200                                                           |
| Smoke: `GET /dashboard`   | 302 → `/auth/signin`                                          |

## Pending (manual)

1. **Supabase** — Create hosted project; copy URL + anon key into `.env` and `.dev.vars` (`cp .env.example .dev.vars`).
2. **Wrangler secrets** — After Supabase is ready:
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_KEY
   ```
3. **GitHub + Workers Builds** — Push repo to GitHub, then in Cloudflare dashboard: **Workers & Pages** → `sprint-capacity-intelligence` → **Settings** → **Builds** → **Connect**. Build command: `npm ci && npx astro sync && npm run build`. Deploy command: `npx wrangler deploy`. Production branch: `master`.

## Rollback

```bash
npx wrangler deployments list
npx wrangler rollback 4f436e64-eb0f-4aa1-bcf2-a32c8caec1c1
```
