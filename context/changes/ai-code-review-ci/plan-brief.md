# AI Code Review CI — Plan Brief

> Full plan: `context/changes/ai-code-review-ci/plan.md`
> Research: `context/changes/ai-code-review-ci/research.md`

## What & Why

Wire the existing Cursor SDK agent under `code-review/` into PR CI for `master` so every same-repo PR gets project-aware review criteria, a structured JSON result, an advisory PR comment, and `ai-cr-passed` / `ai-cr-failed` labels. Motivation: make AI review a usable PR signal without blocking merge on LLM flakiness.

## Starting Point

Agent package, composite action, and `review.yml` already run and emit Zod-validated JSON. The workflow ignores everything except an unused `verdict` output; criteria are generic; labels and comments are missing.

## Desired End State

On same-repo PRs to `master`, CI runs the agent with short project criteria, posts a fresh issue comment (scores + summary), toggles exactly one `ai-cr-*` label, and keeps the check green even when `verdict=fail`. Fork PRs skip side effects; Cursor spend is limited via concurrency cancel.

## Key Decisions Made

| Decision       | Choice                            | Why (1 sentence)                                   | Source   |
| -------------- | --------------------------------- | -------------------------------------------------- | -------- |
| Fail on fail   | Advisory only (check stays green) | Avoid merge blocks from flaky LLM judgment         | Plan     |
| Comment shape  | New issue comment each run        | Simplest glue; accept comment noise on busy PRs    | Plan     |
| Criteria depth | Short `code-review/criteria.md`   | High-priority rules without dumping AGENTS/CLAUDE  | Plan     |
| Architecture   | Agent JSON + workflow glue        | Keeps package reusable; matches research           | Research |
| Forks          | Skip agent side effects (v1)      | Default `GITHUB_TOKEN` often cannot write on forks | Plan     |
| Cost control   | Concurrency cancel-in-progress    | Cursor API billed per run (`lessons.md`)           | Research |

## Scope

**In scope:**

- `criteria.md` + prompt injection
- Action: base fetch, full JSON outputs (`verdict`, `summary`, `result-file`)
- `review.yml`: permissions, concurrency, comment, labels, fork guard, artifact
- Docs / production-readiness checklist (`CURSOR_API_KEY`, labels, cost)

**Out of scope:**

- Fail check / REQUEST_CHANGES on `verdict=fail`
- Sticky comments, full AGENTS dump, SDK structured output, findings arrays
- Merging into `ci.yml` or gating Cloudflare deploy
- Agent unit test suite; required branch-protection status

## Architecture / Approach

```
PR → review.yml → ./code-review action
                      ├─ fetch base + diff
                      ├─ Cursor agent + criteria.md
                      └─ JSON outputs
                 → artifact + issue comment + ai-cr-* labels
                 (advisory: job OK even if verdict=fail)
```

`ci.yml` remains separate lint+build.

## Phases at a Glance

| Phase               | What it delivers                        | Key risk                          |
| ------------------- | --------------------------------------- | --------------------------------- |
| 1. Project Criteria | `criteria.md` injected into prompt      | Criteria too thin or too long     |
| 2. Action Outputs   | Full JSON outputs + reliable base fetch | Output wiring mistakes in YAML    |
| 3. Workflow Glue    | Comment, labels, concurrency, docs      | Secret missing; fork/token quirks |

**Prerequisites:** Repo secret `CURSOR_API_KEY`; ability to open a same-repo PR to `master`
**Estimated effort:** ~1–2 sessions across 3 phases (Phase 3 needs a live PR smoke)

## Open Risks & Assumptions

- `CURSOR_API_KEY` may not be set yet — workflow fails until it is
- Label auto-create may need org permissions; checklist covers manual creation
- Advisory mode means humans must notice `ai-cr-failed` — not a merge gate

## Success Criteria (Summary)

- Same-repo PR gets a new AI review comment + correct `ai-cr-*` label
- `verdict=fail` does not fail the GitHub check
- Criteria file drives project-specific review guidance in CI
