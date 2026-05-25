---
starter_id: 10x-astro-starter
package_manager: npm
project_name: sprint-capacity-intelligence
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: gitlab-ci
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
---

## Why this stack

Solo, after-hours MVP in three weeks with Google OAuth, secure token storage, and server-side sprint risk computation needs a TypeScript-first full-stack starter that ships auth, PostgreSQL, and edge deploy without assembly time. 10x Astro Starter (Astro + Supabase + Cloudflare) matches the PRD's auth requirement via Supabase, provides a conventional project layout agents recognize, and deploys to Cloudflare Pages as chosen. Mainstream React islands cover the risk-table UI; Jira and Calendar integrations layer on Astro API routes. GitLab CI with auto-deploy on merge fits the team's pipeline preference.
