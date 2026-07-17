# CR Agent Eval (Promptfoo Model Matrix) Implementation Plan

## Overview

Build a small Promptfoo suite under `code-review/` that runs the real Cursor `ReviewAgent` on fixed golden diffs across three models (`composer-2.5` + two rivals), produces a pass/fail + latency (+ usage when available) matrix, and fails CI when prompt/criteria files change and the suite regresses. Goal: choose cheaper vs more expensive review models with evidence, and keep the suite as a regression gate before further prompt edits.

## Current State Analysis

- `code-review/` is a standalone Cursor SDK CLI: env diff → `buildReviewPrompt()` (`SYSTEM_PROMPT` + `criteria.md` + diff) → local agent → Zod JSON (`verdict` + scores) on stdout.
- Default model is `composer-2.5` (`REVIEW_MODEL`); CI advisory review lives in `.github/workflows/review.yml` and does **not** fail on `verdict=fail`.
- No eval fixtures, no Promptfoo, no agent tests, no latency/usage fields on `ReviewResult`.
- Prior change (`context/archive/2026-07-17-ai-code-review-ci/`) deferred an agent test suite by design; this change is the first regression mechanism.
- **Cost prior (`lessons.md`):** Cursor API is billed per agent run × tool rounds. A 3×4 matrix is ~12 paid runs per eval trigger.

## Desired End State

- `code-review/eval/` holds 3–4 committed fixture diffs with expected `verdict`s and a Promptfoo config that invokes the production `ReviewAgent` path for three models.
- `npm run eval` in `code-review/` prints a model × fixture matrix (verdict match, schema OK, latencyMs, usage if SDK provides it).
- A path-filtered GitHub workflow runs that suite on PRs that touch prompt/criteria (and related eval harness files), uses `CURSOR_API_KEY` from the **PRD** environment, and **fails the check** when assertions fail.
- Docs explain how to run locally, which models are compared, and the expected Cursor spend.

### Key Discoveries:

- Assert on schema validity + expected `verdict`, not invented score cutoffs — production has none (`review-schema.ts`).
- Full-agent evals need `REVIEW_CWD` pinned to a repo state compatible with each fixture (prefer synthetic diffs that do not require a special commit checkout when possible).
- Parse / round-cap failures (exit 3) are distinct from `verdict=fail` and must count as eval failures.
- Keep advisory `review.yml` unchanged; do not multiply cost inside per-PR advisory review.

## What We're NOT Doing

- Changing advisory PR review semantics (`verdict=fail` still does not fail `review.yml`)
- Prompt-only / raw-LLM provider path (deferred; full agent only for this change)
- Score-threshold or score↔verdict consistency enforcement in production agent
- Line-level findings arrays or SDK native structured output
- Pre-commit / husky hooks that call the Cursor API
- Merging eval into `ci.yml` lint/build job
- Expanding `criteria.md` content (fixtures exercise existing rules; no criteria rewrite)
- Picking permanent production `REVIEW_MODEL` in this change (matrix informs a later decision)

## Implementation Approach

1. Instrument `ReviewAgent` so each run records wall-clock latency and, if present on `runRef.wait()`, SDK usage fields.
2. Author 3–4 synthetic golden diffs + expected verdicts under `code-review/eval/fixtures/`.
3. Add Promptfoo with a custom provider that constructs `ReviewAgent` + fixture `ReviewRequest`, parameterized by model id.
4. Wire `npm run eval` and a blocking, path-filtered workflow with fork guard and PRD secrets.
5. Document models, cost, and how to interpret the matrix.

Rival model IDs are chosen during implementation from models available to the team Cursor plan; baseline is always `composer-2.5`. Record the three IDs in eval config (not hard-coded only in CI YAML).

## Critical Implementation Details

**Cost budget:** Each prompt-path PR can incur ~12 Cursor agent runs (3 models × up to 4 fixtures). Keep fixtures small; use concurrency cancel on the eval workflow; do not also run the matrix from `review.yml`.

**Blocking vs flaky LLM:** The gate fails on wrong expected `verdict`, unparseable output, or agent/run errors — not on advisory PR taste. Prefer synthetic, unambiguous fail cases (e.g. plaintext PAT in a route response) so models that follow `criteria.md` should agree. If a single fixture is chronically flaky across models, fix the fixture before loosening assertions.

**Fixture vs disk:** Prompt tells the agent it may read the repo. Prefer self-contained diffs whose violation is visible in the patch text so tool reads are optional; set `REVIEW_CWD` to the monorepo root as today.

---

## Phase 1: Instrumentation and Golden Fixtures

### Overview

Extend review results with measurable latency (and usage when available), and add the committed golden set the matrix will run against.

### Changes Required:

#### 1. Review result metrics

**File**: `code-review/src/types.ts`, `code-review/src/review-agent.ts`

**Intent**: Every successful or cancelled-with-parse path should expose wall-clock `latencyMs` and optional usage fields so Promptfoo can report cost/latency without scraping stderr.

**Contract**: Extend `ReviewResult` with `latencyMs: number` and optional `usage` (shape verified against installed `@cursor/sdk` types at implement time — attach whatever `runRef.wait()` returns if present; otherwise omit and document “latency-only”). Do not break CLI stdout JSON shape for CI: keep stdout as `ReviewOutput` only; metrics stay on `ReviewResult` for the provider / stderr logs.

#### 2. Golden fixtures

**File**: `code-review/eval/fixtures/` (new)

**Intent**: Ship 3–4 small, unambiguous diffs with expected verdicts covering hard rules in `criteria.md`.

**Contract**: At minimum include:

- `pass-benign` — refactor/docs-only change → expected `pass`
- `fail-secret-leak` — decrypted PAT / token logged or returned → expected `fail`
- `fail-auth-gate` — Jira JSON route without auth/PAT gate → expected `fail`
- Optional fourth: `pass-empty` or another criteria-aligned fail (service-role misuse)

Each fixture directory (or paired files) provides: `diff.patch` (or `.diff`), optional `meta.json` (`prTitle`, `prBody`, `expectedVerdict`). Prefer committed text fixtures over live `git diff` generation.

#### 3. Fixture loader helper (optional but recommended)

**File**: `code-review/eval/load-fixtures.ts` (or equivalent under `eval/`)

**Intent**: Shared loader for Promptfoo provider and local smoke scripts.

**Contract**: Given a fixture id, return `{ diff, prTitle?, prBody?, expectedVerdict }`.

### Success Criteria:

#### Automated Verification:

- `code-review` typecheck passes: `npm run typecheck` (cwd `code-review`)
- Fixture files exist for at least three cases with `expectedVerdict` set
- A one-off smoke (tsx script or temporary call) can run `ReviewAgent` on one fixture and print `latencyMs` without changing advisory CI stdout contract

#### Manual Verification:

- Confirm synthetic fail fixtures are obviously wrong against `criteria.md` (human read)
- Confirm benign pass fixture would not trip hard rules

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before Phase 2.

---

## Phase 2: Promptfoo Harness and Local Matrix

### Overview

Add Promptfoo, a custom provider wrapping `ReviewAgent`, three-model config, and `npm run eval` that emits the comparison matrix locally.

### Changes Required:

#### 1. Dependencies and scripts

**File**: `code-review/package.json`, lockfile

**Intent**: Add Promptfoo as a dev dependency and an `eval` script for local/CI use.

**Contract**: Script runs Promptfoo against `code-review/eval/promptfooconfig.yaml` (or `.js`) with `CURSOR_API_KEY` required. Prefer `tsx` for the custom provider if written in TypeScript.

#### 2. Custom provider

**File**: `code-review/eval/provider.ts` (or `.mjs`)

**Intent**: Invoke the same agent path as production for each (model, fixture) pair.

**Contract**: Provider receives model id + fixture id (or diff path); builds `ReviewAgentConfig` (`apiKey` from env, `cwd` default monorepo root, `modelId`, `maxRounds` default 5); calls `review()`; returns structured output including `verdict`, scores, `latencyMs`, usage if any, `status`. Map parse/run errors to failed assertions (not silent pass).

#### 3. Promptfoo config + model list

**File**: `code-review/eval/promptfooconfig.yaml` (and/or `models.json`)

**Intent**: Declare baseline `composer-2.5` plus two rival model IDs and map fixtures to expected `verdict` assertions.

**Contract**: Assertions: expected `verdict` equality; output parseable as review schema. Cost/latency are reported as metrics/columns (do not fail solely on latency thresholds in MVP). Document the three model IDs in README.

#### 4. Docs

**File**: `code-review/README.md`, `code-review/.env.example`

**Intent**: Document `npm run eval`, required env, fixture layout, cost warning (~12 runs), and that rivals are listed in eval config.

**Contract**: Do not require Promptfoo for normal `npm run review` / CI advisory path.

### Success Criteria:

#### Automated Verification:

- `npm run eval` exits non-zero when a fixture’s expected verdict is deliberately mismatched in a dry check (or Promptfoo assertion unit if available without full API)
- With `CURSOR_API_KEY` set, full matrix run completes and writes/prints results for 3 models × fixtures
- `npm run typecheck` still passes

#### Manual Verification:

- Inspect matrix: pass/fail per model/fixture plus latency (and usage if present)
- Confirm rivals are models actually available on the team Cursor plan

**Implementation Note**: Pause for human confirmation of the first real matrix run before enabling blocking CI.

---

## Phase 3: Blocking Path-Filtered CI Gate

### Overview

Add a dedicated workflow that runs the eval suite when prompt/criteria (or eval harness) files change, and fails the check on assertion failure.

### Changes Required:

#### 1. Eval workflow

**File**: `.github/workflows/cr-eval.yml` (new)

**Intent**: Blocking regression gate separate from advisory `review.yml` and from lint `ci.yml`.

**Contract**:

- Triggers: `pull_request` to `master` with path filters covering at least `code-review/criteria.md`, `code-review/src/prompts.ts`, `code-review/src/review-schema.ts`, `code-review/src/load-criteria.ts`, `code-review/src/review-agent.ts`, `code-review/eval/**`, and this workflow file; plus `workflow_dispatch`
- Job uses `environment: PRD` and `secrets.CURSOR_API_KEY` (same as `review.yml`)
- Fork PRs skip paid runs (same full_name guard pattern as `review.yml`)
- Concurrency group with `cancel-in-progress: true` to limit stacked spend
- Steps: checkout, setup Node 22, `npm ci` in `code-review/`, run `npm run eval`, upload Promptfoo/output artifact
- Job **fails** when eval assertions fail (no `continue-on-error`)

#### 2. Production readiness notes

**File**: `code-review/README.md` (and optionally this change’s notes)

**Intent**: Checklist for enabling the gate: PRD `CURSOR_API_KEY`, path filters, expected ~12 agent runs per triggering PR, how to re-run via `workflow_dispatch`.

**Contract**: Explicitly state advisory `review.yml` remains non-blocking on `verdict=fail`.

### Success Criteria:

#### Automated Verification:

- Workflow file validates (YAML present; path filters include prompt/criteria + eval paths)
- Opening or simulating a PR that only touches `code-review/criteria.md` would match path filters (document how verified)
- Artifact upload path configured for eval results

#### Manual Verification:

- `workflow_dispatch` or a same-repo PR touching a gated path runs the suite successfully with PRD secret
- A deliberately broken expected-verdict (temporary) fails the check, then is reverted
- Confirm fork PRs do not consume API budget

**Implementation Note**: After CI smoke, treat the suite as the gate for subsequent prompt changes.

---

## Testing Strategy

### Unit Tests:

- Optional light tests for fixture loader / expectedVerdict parsing (no Cursor API)
- Prefer not to mock the full SDK in MVP unless loader logic grows

### Integration Tests:

- Promptfoo matrix against live Cursor API (local + CI) is the primary integration proof
- Assert expected `verdict` per fixture; treat parse errors as failures

### Manual Testing Steps:

1. Run `npm run eval` locally with `.env` `CURSOR_API_KEY`
2. Compare three models on the same fixtures; note latency/usage
3. Trigger CI via path change or `workflow_dispatch`
4. Confirm advisory `review.yml` behavior unchanged on a normal app PR

## Performance Considerations

- Cap fixtures at 3–4 and keep diffs short to limit tokens and tool rounds
- Concurrency cancel on eval workflow; do not fan out parallel model jobs unless cost is acceptable (serial Promptfoo is fine for MVP)
- Default `REVIEW_MAX_ROUNDS=5`; do not raise for evals without need

## Migration Notes

- No database or app runtime migration
- New secret dependency is the existing PRD `CURSOR_API_KEY` — no new secret names required if already set for `review.yml`
- Rival model IDs may need updating when Cursor renames models; keep them in one eval config file

## References

- Related research: `context/changes/cr-agent-eval/research.md`
- Prior CI wiring: `context/archive/2026-07-17-ai-code-review-ci/`
- Agent: `code-review/src/review-agent.ts`, `code-review/src/prompts.ts`, `code-review/src/review-schema.ts`
- Advisory workflow: `.github/workflows/review.yml`
- Cost lesson: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Instrumentation and Golden Fixtures

#### Automated

- [x] 1.1 `code-review` typecheck passes: `npm run typecheck` (cwd `code-review`) — f457815
- [x] 1.2 Fixture files exist for at least three cases with `expectedVerdict` set — f457815
- [x] 1.3 Smoke can run `ReviewAgent` on one fixture and print `latencyMs` without changing advisory CI stdout contract — f457815

#### Manual

- [x] 1.4 Confirm synthetic fail fixtures are obviously wrong against `criteria.md` (human read) — f457815
- [x] 1.5 Confirm benign pass fixture would not trip hard rules — f457815

### Phase 2: Promptfoo Harness and Local Matrix

#### Automated

- [x] 2.1 `npm run eval` exits non-zero on deliberate expected-verdict mismatch (or equivalent assertion check) — a8776d6
- [x] 2.2 With `CURSOR_API_KEY` set, full matrix run completes for 3 models × fixtures — a8776d6
- [x] 2.3 `npm run typecheck` still passes — a8776d6

#### Manual

- [x] 2.4 Inspect matrix: pass/fail per model/fixture plus latency (and usage if present) — a8776d6
- [x] 2.5 Confirm rivals are models actually available on the team Cursor plan — a8776d6

### Phase 3: Blocking Path-Filtered CI Gate

#### Automated

- [x] 3.1 Workflow file present with path filters covering prompt/criteria + eval paths
- [x] 3.2 Documented verification that a criteria-only PR would match path filters
- [x] 3.3 Artifact upload configured for eval results

#### Manual

- [ ] 3.4 `workflow_dispatch` or same-repo PR on a gated path runs successfully with PRD secret
- [ ] 3.5 Deliberately broken assertion fails the check, then is reverted
- [ ] 3.6 Fork PRs do not consume API budget
