# @code-review/agent

Pull-request code review agent built on the [Cursor TypeScript SDK](https://cursor.com/docs/sdk/typescript). Always reviews a precomputed diff (`base...HEAD`); PR title and description are optional context.

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

The composite action checks out the repo, computes `origin/<base>...HEAD`, and runs the agent:

```yaml
# .github/workflows/review.yml
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: ./code-review
        with:
          api-key: ${{ secrets.CURSOR_API_KEY }}
```

Optional inputs: `base-ref`, `model`, `max-rounds`.

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
