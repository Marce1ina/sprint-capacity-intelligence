# CR Agent Eval — Plan Brief

> Full plan: `context/changes/cr-agent-eval/plan.md`
> Research: `context/changes/cr-agent-eval/research.md`

## What & Why

Add a Promptfoo suite that runs the real Cursor code-review agent on the same fixed diffs across three models and reports pass/fail plus latency (and usage when available). Motivation: pick cheaper vs more expensive review models with a hard matrix, then keep the suite as a blocking regression gate before prompt changes — not gut feel from one PR.

## Starting Point

`code-review/` already reviews via Cursor SDK + `criteria.md` and posts advisory CI results. There are no golden diffs, no Promptfoo, and no latency/usage on `ReviewResult`. Advisory `review.yml` stays green on `verdict=fail`.

## Desired End State

Local `npm run eval` and a path-filtered blocking workflow produce a 3-model × 3–4-fixture matrix. Prompt/criteria PRs fail CI when expected verdicts or parseability regress. Advisory per-PR review behavior is unchanged.

## Key Decisions Made

| Decision        | Choice                                       | Why (1 sentence)                           | Source          |
| --------------- | -------------------------------------------- | ------------------------------------------ | --------------- |
| Eval fidelity   | Full `ReviewAgent` (tools on)                | Match production CI agent path             | Plan            |
| Models          | `composer-2.5` + 2 rivals                    | Side-by-side cheaper vs expensive evidence | Plan            |
| Rival IDs       | Chosen at implement from team Cursor catalog | No prior shortlist in research             | Research / Plan |
| Gate            | Blocking CI on prompt/criteria path changes  | Real regression gate, not voluntary-only   | Plan            |
| Fixtures        | 3–4 synthetic golden diffs                   | Cover hard rules without huge API spend    | Plan            |
| Assertions      | Expected `verdict` + schema/parse OK         | Production has no score thresholds         | Research        |
| Advisory review | Unchanged                                    | Avoid flaky merge blocks on normal PRs     | Research        |

## Scope

**In scope:** Agent latency/usage instrumentation, fixtures, Promptfoo provider + config, `npm run eval`, blocking path-filtered workflow, docs/cost checklist

**Out of scope:** Prompt-only provider, changing advisory `review.yml` fail semantics, score thresholds in production, pre-commit API calls, permanent production model switch

## Architecture / Approach

```
fixtures + models → Promptfoo custom provider → ReviewAgent (Cursor SDK)
                                              → matrix (verdict, latency, usage?)
PR touches prompt/criteria → cr-eval.yml (PRD secret) → fail on assertion miss
Normal PRs → review.yml advisory (unchanged)
```

**Cost:** ~3 models × ≤4 fixtures ≈ up to **12 Cursor agent runs** per triggering PR (`lessons.md`).

## Phases at a Glance

| Phase                         | What it delivers                         | Key risk                             |
| ----------------------------- | ---------------------------------------- | ------------------------------------ |
| 1. Instrumentation + fixtures | `latencyMs` (+ usage), 3–4 golden diffs  | Ambiguous fixtures → flaky verdicts  |
| 2. Promptfoo harness          | Provider, 3-model config, `npm run eval` | Rival model IDs unavailable on plan  |
| 3. Blocking CI gate           | Path-filtered failing workflow           | LLM flake reds prompt PRs; API spend |

**Prerequisites:** PRD `CURSOR_API_KEY`; Cursor models available for two rivals besides `composer-2.5`
**Estimated effort:** ~2–3 sessions across 3 phases (Phase 2/3 need live API runs)

## Open Risks & Assumptions

- SDK may not expose usable token/cost fields — plan falls back to latency-only metrics
- Blocking gate can flake; fixtures must be unambiguous against `criteria.md`
- Auto CI on every prompt edit multiplies Cursor spend vs local-only

## Success Criteria (Summary)

- Same diffs run across three models with a readable pass/fail + latency matrix
- Prompt/criteria changes fail CI when the suite regresses
- Advisory PR review remains non-blocking on `verdict=fail`
