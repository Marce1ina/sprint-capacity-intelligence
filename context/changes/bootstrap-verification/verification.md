---
bootstrapped_at: 2026-05-25T06:17:59Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: sprint-capacity-intelligence
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: sprint-capacity-intelligence
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: true
    conventions: true
    docs_current: true
    can_judge_agent: false
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

Solo, after-hours MVP in three weeks with Google OAuth, secure token storage, and server-side sprint risk computation needs a TypeScript-first full-stack starter that ships auth, PostgreSQL, and edge deploy without assembly time. 10x Astro Starter (Astro + Supabase + Cloudflare) matches the PRD's auth requirement via Supabase, provides a conventional project layout agents recognize, and deploys to Cloudflare Pages as chosen. Mainstream React islands cover the risk-table UI; Jira and Calendar integrations layer on Astro API routes. GitHub Actions for lint and build, with Cloudflare Workers Builds auto-deploy on push to master via the GitHub integration, fits the team's pipeline preference.

## Pre-scaffold verification

| Signal      | Value                                                | Severity | Notes                                       |
| ----------- | ---------------------------------------------------- | -------- | ------------------------------------------- |
| npm package | not run                                              | —        | cmd_template uses git clone, not npm create |
| GitHub repo | przeprogramowani/10x-astro-starter pushed 2026-05-17 | fresh    | via GitHub API (gh CLI unavailable)         |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`

**Strategy**: git-clone

**Exit code**: 0

**Files moved**: 31442

**Conflicts (.scaffold siblings)**: none

**.gitignore handling**: moved silently

**.bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: npm audit --json

**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW

**Direct vs transitive**: 0/0/2/0 direct of total 0/1/9/0 (per-package `isDirect` in npm audit report)

#### CRITICAL findings

None.

#### HIGH findings

- **devalue** (transitive) — GHSA-77vg-94rm-hx3p: Svelte devalue DoS via sparse array deserialization (CVSS 7.5). Range 5.6.3–5.8.0. Fix available via dependency updates.

#### MODERATE findings

- **@astrojs/check** (direct) — via @astrojs/language-server → volar-service-yaml chain
- **@astrojs/language-server** (transitive)
- **@cloudflare/vite-plugin** (transitive) — via miniflare, wrangler, ws
- **miniflare** (transitive) — via ws
- **volar-service-yaml** (transitive)
- **wrangler** (direct) — via miniflare
- **ws** (transitive) — GHSA-58qx-3vcg-4xpx: uninitialized memory disclosure
- **yaml** (transitive) — GHSA-48c2-rrv3-qjmp: stack overflow via nested YAML
- **yaml-language-server** (transitive)

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value                                                                            |
| ----------------------- | -------------------------------------------------------------------------------- |
| bootstrapper_confidence | first-class                                                                      |
| quality_override        | false                                                                            |
| path_taken              | custom                                                                           |
| self_check_answers      | typed/from_official_starter/conventions/docs_current true; can_judge_agent false |
| team_size               | solo                                                                             |
| deployment_target       | cloudflare-pages                                                                 |
| ci_provider             | github-actions                                                                   |
| ci_default_flow         | auto-deploy-on-merge                                                             |
| has_auth                | true                                                                             |
| has_payments            | false                                                                            |
| has_realtime            | false                                                                            |
| has_ai                  | false                                                                            |
| has_background_jobs     | false                                                                            |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
