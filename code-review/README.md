# @code-review/agent

Local code review agent built on the [Cursor TypeScript SDK](https://cursor.com/docs/sdk/typescript).

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

## Usage

Review branch changes against `main`:

```bash
npm run review
```

Review uncommitted edits:

```bash
npm run review -- --scope uncommitted
```

Custom instructions:

```bash
npm run review -- --base origin/main --instructions "Focus on RLS and token handling"
```

Full custom prompt:

```bash
npm run review -- --prompt "Review the diff in PR #42 for security issues"
```

## Environment

| Variable            | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| `CURSOR_API_KEY`    | Required API key                                              |
| `REVIEW_CWD`        | Repo root for the local agent (defaults to the monorepo root) |
| `REVIEW_MODEL`      | Model id (defaults to `composer-2.5`)                         |
| `REVIEW_MAX_ROUNDS` | Max tool-use rounds before cancel (defaults to `5`)           |

## Project layout

```
src/
  index.ts        CLI entrypoint
  review-agent.ts Cursor SDK wrapper
  prompts.ts      Review prompt builder
  config.ts       Env loading
  cli.ts          Argument parsing
  types.ts        Shared types
```

Extend `src/review-agent.ts` for cloud runs, MCP servers, or resume flows.

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
