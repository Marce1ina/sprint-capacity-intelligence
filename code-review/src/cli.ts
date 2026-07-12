import { readFileSync } from "node:fs";

import type { ReviewRequest } from "./types.js";

export interface CliOptions {
  help: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { help: false };
}

export function printHelp(): void {
  console.log(`Usage: npm run review [-- -h]

Reviews a precomputed pull-request diff. Set REVIEW_DIFF or REVIEW_DIFF_FILE.

Environment:
  CURSOR_API_KEY     Required Cursor API key
  REVIEW_DIFF        Git patch (base...HEAD)
  REVIEW_DIFF_FILE   Path to a patch file (overrides REVIEW_DIFF)
  REVIEW_PR_TITLE    Pull request title (optional)
  REVIEW_PR_BODY     Pull request description (optional)
  REVIEW_CWD         Repo root for the local agent (default: parent of code-review/)
  REVIEW_MODEL       Model id (default: composer-2.5)
  REVIEW_MAX_ROUNDS  Max tool-use rounds before cancelling (default: 5)

Example:
  git diff origin/master...HEAD > /tmp/pr.diff
  REVIEW_DIFF_FILE=/tmp/pr.diff npm run review
`);
}

export function loadReviewRequest(): ReviewRequest {
  return {
    diff: loadDiffFromEnv(),
    prTitle: process.env.REVIEW_PR_TITLE?.trim() ?? undefined,
    prBody: process.env.REVIEW_PR_BODY?.trim() ?? undefined,
  };
}

function loadDiffFromEnv(): string {
  const diffFile = process.env.REVIEW_DIFF_FILE?.trim();
  if (diffFile) {
    return readFileSync(diffFile, "utf8");
  }

  const diff = process.env.REVIEW_DIFF?.trim();
  if (!diff) {
    throw new Error("REVIEW_DIFF or REVIEW_DIFF_FILE is required.");
  }

  return diff;
}
