# AI Code Review CI Implementation Plan

## Overview

Finish wiring the existing Cursor SDK review agent (`code-review/`) into GitHub Actions for PRs targeting `master`: inject project-specific CR criteria, surface full structured JSON from the composite action, and post an advisory PR issue comment plus `ai-cr-passed` / `ai-cr-failed` labels — without failing the check on `verdict=fail`.

## Current State Analysis

A working draft already exists:

- `code-review/` package runs a Cursor local agent, validates JSON via Zod (`implementationCorrectness`, `idiomaticity`, `complexity`, `testRiskCoverage`, `securitySafety`, `verdict`, `summary`), writes JSON to stdout.
- Composite action `code-review/action.yml` checks out the repo, diffs `origin/<base>...HEAD`, builds and runs the agent, extracts only `.verdict`.
- `.github/workflows/review.yml` triggers on `pull_request` → `master` (+ `workflow_dispatch`) and calls `./code-review` with `CURSOR_API_KEY` / optional `REVIEW_*` vars.

Gaps vs the change goal:

- Prompt criteria are generic five dimensions only — no AGENTS/CLAUDE hard rules (`settingSources: []` prevents auto-loading Cursor rules).
- Workflow discards scores and `summary`; no PR comment, no labels, no `permissions` / concurrency.
- Agent exits `0` on `verdict=fail` (parse success) — intentional for this plan’s **advisory** mode; job must still fail only on startup/run/parse errors.
- Diff prep does not explicitly `git fetch` the base ref; fork PRs risk label/comment write failures with default `GITHUB_TOKEN`.

`ci.yml` stays independent lint+build. Deploy remains Cloudflare Workers Builds — do not gate deploy on Cursor.

## Desired End State

On every non-fork PR to `master` (and on `workflow_dispatch` when a PR context exists):

1. The agent reviews the PR diff using a short project `criteria.md` in addition to the five score dimensions.
2. The composite action exposes `verdict`, `summary`, and a path to the full JSON result.
3. The workflow posts a new issue comment containing the Markdown `summary` (and a compact score table), then toggles labels so exactly one of `ai-cr-passed` / `ai-cr-failed` is present.
4. The GitHub check stays **green** when the agent returns a valid review with `verdict=fail` (advisory only). The check fails only when the agent cannot produce valid JSON or the run errors.
5. Concurrent runs for the same PR cancel in-progress work to limit Cursor API spend.

### Key Discoveries:

- Separation of concerns is already the right architecture: agent → JSON; GitHub side effects in `review.yml` (`research.md` Architecture Insights).
- `summary` is already shaped as PR-comment Markdown (`review-schema.ts`); posting is glue.
- Cursor API is billed per run (`lessons.md`) — concurrency + cancel-in-progress is a cost control, not optional polish.
- No existing `actions/github-script` / `gh` / Octokit usage in the repo — first introduction in `review.yml`.

## What We're NOT Doing

- Failing the GitHub check (or requesting changes) when `verdict=fail`
- Sticky / edit-in-place comments (each run posts a **new** issue comment)
- Formal `pull_request_review` APPROVE / REQUEST_CHANGES
- Merging AI review into `ci.yml` or blocking Cloudflare deploy on Cursor
- Dumping full `AGENTS.md` / `CLAUDE.md` into the prompt
- SDK native structured output, score thresholds, line-level findings arrays
- `pull_request_target` or elevated tokens for fork PRs (skip side effects on forks)
- Unit/integration test suite for the agent package (out of scope for this wiring change)
- Making the review check required in branch protection (optional ops step after the plan; not automated here)

## Implementation Approach

Hybrid split:

1. **Criteria content** in `code-review/criteria.md`, loaded into the review prompt so the agent grades against project hard rules without relying on Cursor `settingSources`.
2. **Composite action** owns review-runtime concerns: fetch base ref, persist full JSON, expose outputs needed by the workflow.
3. **`review.yml`** owns GitHub product surface: `permissions`, concurrency, issue comment, label toggle, fork guard, artifact upload of the JSON result, and a short ops checklist in docs.

## Critical Implementation Details

- **Advisory exit contract**: Do not change agent exit codes so `verdict=fail` fails the step. Workflow steps that post comments/labels must run after a successful agent parse and must **not** `exit 1` solely because `verdict=fail`.
- **Fork PRs**: When `github.event.pull_request.head.repo.full_name != github.repository`, skip comment/label steps (and prefer skipping the paid agent run entirely if easy to gate). Document that fork contributions do not get AI CR labels/comments in v1.
- **Label toggle**: Ensure only one of `ai-cr-passed` / `ai-cr-failed` remains — remove the opposite label before adding the new one; create labels on first use if the API allows, or document one-time manual label creation in the production checklist.

## Phase 1: Project Criteria

### Overview

Add a short, high-priority criteria file and inject it into the agent prompt so reviews enforce this repo’s security and API conventions, not only generic quality dimensions.

### Changes Required:

#### 1. Criteria document

**File**: `code-review/criteria.md`

**Intent**: Capture the high-priority project rules the reviewer must apply when scoring and choosing `verdict`. Keep it short enough to fit in every prompt.

**Contract**: Markdown file listing hard rules derived from `AGENTS.md` / `CLAUDE.md` / research, at minimum:

- Never log or return decrypted tokens / PATs; AES-encrypt integration credentials before storage
- API routes: `prerender = false`; auth + Jira PAT via `jira-api-context` / `IntegrationTokenService` — never return PAT or decrypted payloads
- `createAdminClient()` / service-role only in account-deletion flow — never attach to `context.locals` or client UI
- Prefer secret-leak / auth-gate / IDOR test patterns on risky auth and token paths
- Astro for layout; React only for interactivity; no Next.js `"use client"` directives

Do not paste entire AGENTS/CLAUDE files.

#### 2. Prompt injection

**File**: `code-review/src/prompts.ts` (and any small helper if needed to load the file)

**Intent**: Include `criteria.md` contents in the prompt sent to the agent so criteria apply even with `settingSources: []`.

**Contract**: `buildReviewPrompt()` incorporates criteria text (read from `code-review/criteria.md` relative to the package, or passed in). Failure to load criteria should fail startup clearly (exit path already used for config errors), not silently fall back to generic-only review.

#### 3. Docs touch for local reviewers

**File**: `code-review/README.md`

**Intent**: Document that reviews use `criteria.md` and how to edit it.

**Contract**: Short section describing criteria location and that CI uses the same file.

### Success Criteria:

#### Automated Verification:

- `criteria.md` exists under `code-review/` and covers the hard-rule themes above
- `cd code-review && npm run typecheck` passes after prompt changes
- `cd code-review && npm run build` succeeds

#### Manual Verification:

- Local dry-run with a small diff shows the prompt path still produces valid JSON (optional if no `CURSOR_API_KEY` locally — then verify by reading that criteria text is included in the built prompt path / unit-free inspection of the loader)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before Phase 2.

---

## Phase 2: Action Outputs + Diff Fidelity

### Overview

Make the composite action produce durable, workflow-consumable outputs from the full review JSON, and fix base-ref fetch so the diff is reliable.

### Changes Required:

#### 1. Diff preparation

**File**: `code-review/action.yml` (`Prepare PR diff` step)

**Intent**: Ensure `origin/<base_ref>` exists before `git diff`.

**Contract**: After resolving `base_ref` (input → `github.base_ref` → `master`), run an explicit `git fetch origin "<base_ref>"` (or equivalent) before `git diff "origin/${base_ref}...HEAD"`.

#### 2. Persist full JSON + outputs

**File**: `code-review/action.yml` (`Run agent` step and `outputs:`)

**Intent**: Stop discarding scores/`summary`; let the workflow post comments and toggle labels from action outputs.

**Contract**:

- Write agent stdout JSON to a stable path under `$RUNNER_TEMP` (e.g. `review-result.json`)
- Action outputs at least: `verdict` (existing), `summary` (string from `.summary`), `result-file` (path to JSON)
- Keep agent package itself free of GitHub API calls

#### 3. README action outputs

**File**: `code-review/README.md`

**Intent**: Document new outputs for workflow authors.

**Contract**: List `verdict`, `summary`, `result-file` under the GitHub Actions section.

### Success Criteria:

#### Automated Verification:

- `action.yml` declares `verdict`, `summary`, and `result-file` outputs
- Prepare-diff step fetches base before diffing
- `cd code-review && npm run build` still succeeds (no package API breakage)

#### Manual Verification:

- On a test PR (or `workflow_dispatch` with PR context once Phase 3 lands), confirm the action log shows a non-empty `summary` output and an uploaded/readable result file path

**Implementation Note**: Pause for manual confirmation before Phase 3 if you want to validate action YAML via a draft PR; otherwise Phase 3 can land with Phase 2 in one PR as long as Success Criteria are checked.

---

## Phase 3: Workflow Glue + Docs

### Overview

Turn `review.yml` into the product surface: permissions, cost-aware concurrency, advisory comment + labels, fork guard, artifact retention, and ops/docs so the team can run it.

### Changes Required:

#### 1. Workflow wiring

**File**: `.github/workflows/review.yml`

**Intent**: Consume action outputs and apply GitHub side effects without failing the job on `verdict=fail`.

**Contract**:

- `permissions`: at least `contents: read`, `pull-requests: write`, `issues: write`
- `concurrency`: group keyed by PR number (e.g. `ai-cr-${{ github.event.pull_request.number || github.run_id }}`) with `cancel-in-progress: true`
- Step `id` on `uses: ./code-review` so outputs are readable
- After successful review: upload `result-file` as a workflow artifact
- Post a **new** issue comment on the PR each run: compact score table (from JSON) + `summary` Markdown
- Label toggle: remove opposite of `ai-cr-passed` / `ai-cr-failed`, then add the label matching `verdict` (`pass` → `ai-cr-passed`, `fail` → `ai-cr-failed`)
- Skip paid agent run and/or skip comment+label steps when the PR is from a fork
- Do **not** fail the job when `verdict=fail`

Prefer `actions/github-script` (or `gh` with `GH_TOKEN`) for comment + labels — first introduction of this pattern in the repo is fine.

#### 2. Production readiness checklist

**Files**: `code-review/README.md` and/or a short subsection in `AGENTS.md` / `CLAUDE.md` CI section

**Intent**: Hosted config is easy to miss (`lessons.md` production-readiness lesson). Surface secrets, vars, labels, and cost before anyone expects the workflow to work.

**Contract**: Document checklist items:

- Repo secret `CURSOR_API_KEY` set
- Optional repo vars `REVIEW_MODEL`, `REVIEW_MAX_ROUNDS`
- Labels `ai-cr-passed` and `ai-cr-failed` exist (or are auto-created by the script)
- Workflow is advisory — green check ≠ pass label
- Cursor API is billed per run; concurrency cancels superseded runs
- Fork PRs are skipped for side effects (and agent run if gated)

Update `AGENTS.md` / `CLAUDE.md` CI blurb to mention `review.yml` alongside `ci.yml`.

### Success Criteria:

#### Automated Verification:

- `review.yml` validates as YAML and includes `permissions`, `concurrency`, comment step, label toggle, and fork guard
- Workflow does not contain a step that fails solely on `verdict=fail`
- Docs mention `CURSOR_API_KEY` and the `ai-cr-*` labels

#### Manual Verification:

- Open a PR to `master` from a branch in the same repo with `CURSOR_API_KEY` configured
- Confirm: workflow runs, artifact has full JSON, a new PR comment appears with summary (+ scores), exactly one of `ai-cr-passed` / `ai-cr-failed` is set
- Push a second commit: prior in-progress run cancels (or is superseded); a **new** comment is posted
- Confirm a `verdict=fail` result still shows a green/successful job (advisory) while `ai-cr-failed` is applied
- Confirm fork PR behavior matches the skip policy (if testable)

**Implementation Note**: This phase requires the GitHub secret and a real PR to fully verify. Do not mark the change complete until the manual PR smoke passes.

---

## Testing Strategy

### Unit Tests:

- None required for this change (no agent test harness in scope). Prefer typecheck + build for package edits.

### Integration Tests:

- Real GitHub Actions run on a same-repo PR is the integration test.

### Manual Testing Steps:

1. Ensure `CURSOR_API_KEY` is configured in repo secrets.
2. Open a same-repo PR targeting `master` with a small, intentional diff.
3. Wait for **AI Code Review** workflow; inspect logs, artifact JSON, PR comment, and labels.
4. Push another commit; confirm concurrency cancel and an additional comment.
5. (Optional) Force a weak/fail-shaped change and confirm advisory green check + `ai-cr-failed`.

## Performance Considerations

- Cursor API cost scales with runs × tool rounds. Concurrency cancel-in-progress is the primary control; keep default `max-rounds` modest (`5` today).
- Do not expand criteria into full AGENTS/CLAUDE dumps — longer prompts increase tokens and dilute attention.

## Migration Notes

- One-time ops: create repo secret `CURSOR_API_KEY` (and labels if not auto-created).
- Existing open PRs get labels/comments only on the next workflow run after merge of this change.
- No database or app runtime migration.

## References

- Related research: `context/changes/ai-code-review-ci/research.md`
- Change notes: `context/changes/ai-code-review-ci/change.md`
- Agent package: `code-review/src/review-schema.ts`, `code-review/src/prompts.ts`, `code-review/action.yml`
- Workflow stub: `.github/workflows/review.yml`
- Cost lesson: `context/foundation/lessons.md` (external API cost; production readiness)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Project Criteria

#### Automated

- [x] 1.1 `criteria.md` exists under `code-review/` and covers the hard-rule themes
- [x] 1.2 `cd code-review && npm run typecheck` passes after prompt changes
- [x] 1.3 `cd code-review && npm run build` succeeds

#### Manual

- [x] 1.4 Local dry-run or inspection confirms criteria are included in the prompt path

### Phase 2: Action Outputs + Diff Fidelity

#### Automated

- [ ] 2.1 `action.yml` declares `verdict`, `summary`, and `result-file` outputs
- [ ] 2.2 Prepare-diff step fetches base before diffing
- [ ] 2.3 `cd code-review && npm run build` still succeeds

#### Manual

- [ ] 2.4 Confirm non-empty `summary` output / readable result file on a test run

### Phase 3: Workflow Glue + Docs

#### Automated

- [ ] 3.1 `review.yml` includes permissions, concurrency, comment, labels, and fork guard
- [ ] 3.2 Workflow does not fail solely on `verdict=fail`
- [ ] 3.3 Docs mention `CURSOR_API_KEY` and `ai-cr-*` labels

#### Manual

- [ ] 3.4 Same-repo PR smoke: artifact, new comment, correct label
- [ ] 3.5 Second push: concurrency cancel + additional comment
- [ ] 3.6 `verdict=fail` stays advisory (green job) with `ai-cr-failed`
- [ ] 3.7 Fork skip policy verified (if testable)
