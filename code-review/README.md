# @code-review/agent

Pull-request code review agent built on the [Cursor TypeScript SDK](https://cursor.com/docs/sdk/typescript). Always reviews a precomputed diff (`base...HEAD`); PR title and description are optional context.

## Project criteria

Reviews load hard rules from [`criteria.md`](./criteria.md) into every prompt (local and CI). Edit that file to change what the agent treats as binding project policy. A missing or empty file fails the run — there is no silent fallback to generic-only scoring.

## Prerequisites

- Node.js **22.13+** (see repo `.nvmrc`)
- A Cursor API key from [Dashboard → Integrations](https://cursor.com/dashboard/integrations)

## Setup

```bash
cd code-review
cp .env.example .env
# edit .env and set CURSOR_API_KEY
npm install
```

## Local usage

```bash
git diff origin/master...HEAD > /tmp/pr.diff
REVIEW_DIFF_FILE=/tmp/pr.diff npm run review
```

With PR metadata:

```bash
REVIEW_DIFF_FILE=/tmp/pr.diff \
REVIEW_PR_TITLE="Add sprint picker" \
REVIEW_PR_BODY="Board/sprint dropdowns and assignee table." \
npm run review
```

## GitHub Actions

The composite action checks out the repo, fetches the base ref, computes `origin/<base>...HEAD`, and runs the agent:

```yaml
# .github/workflows/review.yml
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: ./code-review
        id: ai-review
        with:
          api-key: ${{ secrets.CURSOR_API_KEY }}
```

Optional inputs: `base-ref`, `model`, `max-rounds`.

### Action outputs

| Output        | Description                                       |
| ------------- | ------------------------------------------------- |
| `verdict`     | `pass` or `fail` from the agent                   |
| `summary`     | Markdown summary (suitable for a PR comment)      |
| `result-file` | Path to the full review JSON under `$RUNNER_TEMP` |

## Environment

| Variable            | Description                                         |
| ------------------- | --------------------------------------------------- |
| `CURSOR_API_KEY`    | Required API key                                    |
| `REVIEW_DIFF`       | Git patch (required unless `REVIEW_DIFF_FILE` set)  |
| `REVIEW_DIFF_FILE`  | Path to a patch file (overrides `REVIEW_DIFF`)      |
| `REVIEW_PR_TITLE`   | Pull request title (optional)                       |
| `REVIEW_PR_BODY`    | Pull request description (optional)                 |
| `REVIEW_CWD`        | Repo root for the agent (defaults to monorepo root) |
| `REVIEW_MODEL`      | Model id (defaults to `composer-2.5`)               |
| `REVIEW_MAX_ROUNDS` | Max tool-use rounds before cancel (defaults to `5`) |

## Output

On success, validated JSON is written to **stdout** (schema in `src/review-schema.ts`):

```json
{
  "implementationCorrectness": 8,
  "idiomaticity": 7,
  "complexity": 9,
  "testRiskCoverage": 6,
  "securitySafety": 8,
  "verdict": "pass",
  "summary": "..."
}
```

Agent streaming logs go to stderr. Exit code `3` means the response failed Zod validation.

## Model eval suite (Promptfoo)

Compare review models on committed golden diffs under `eval/fixtures/`. Uses the same `ReviewAgent` path as production (not a prompt-only shortcut).

### Models

Ids live in [`eval/models.json`](./eval/models.json) (source of truth for local + future CI):

| Role           | Model id           |
| -------------- | ------------------ |
| Baseline       | `composer-2.5`     |
| Stronger rival | `claude-sonnet-5`  |
| Cheaper rival  | `claude-haiku-4-5` |

### Cost warning

A full matrix is **3 models × 4 fixtures ≈ 12 Cursor agent runs**, billed on your Cursor plan. Do not run casually. Advisory PR review (`review.yml`) does **not** run this matrix.

### Local commands

```bash
cd code-review
# Dry check: deliberate verdict mismatch fails (no API)
npm run eval:assert-check

# Full matrix (requires CURSOR_API_KEY in .env)
npm run eval
```

Results write to `eval/results/latest.json` (gitignored). Promptfoo is a **devDependency** only — normal `npm run review` / CI advisory path does not need it.

### Fixtures

| Id                  | Expected verdict |
| ------------------- | ---------------- |
| `pass-benign`       | `pass`           |
| `fail-secret-leak`  | `fail`           |
| `fail-auth-gate`    | `fail`           |
| `fail-service-role` | `fail`           |

Assertions: schema-shaped JSON (`verdict`, `status`, `latencyMs`) + `verdict === expectedVerdict`. Latency/usage are reported as metrics; MVP does not fail on latency thresholds.

## Production readiness (hosted CI)

Before expecting AI review on PRs:

1. Set `CURSOR_API_KEY` on the **PRD** GitHub Environment (the workflow job uses `environment: PRD`). A repo-level secret alone is not enough unless you remove that `environment` key.
2. Optional repo variables: `REVIEW_MODEL`, `REVIEW_MAX_ROUNDS`.
3. Labels `ai-cr-passed` and `ai-cr-failed` — created automatically on first successful run, or create them manually if the token cannot create labels.
4. The check is **advisory**: a green workflow does **not** mean `verdict=pass`. Look at the PR comment and `ai-cr-*` label.
5. Cursor API is billed per agent run; concurrency cancels in-progress runs for the same PR.
6. Fork PRs skip the agent and side effects in v1 (default `GITHUB_TOKEN` often cannot write labels/comments on forks).
