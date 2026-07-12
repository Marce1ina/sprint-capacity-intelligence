import { SYSTEM_PROMPT, buildOutputInstructions } from "./review-schema.js";
import type { ReviewRequest } from "./types.js";

export function buildReviewPrompt(request: ReviewRequest): string {
  const sections = [SYSTEM_PROMPT, "", buildDiffInstructions(request), "", buildOutputInstructions()];
  return sections.join("\n");
}

function buildDiffInstructions(request: ReviewRequest): string {
  const sections = ["Review the following pull request diff."];

  if (request.prTitle?.trim()) {
    sections.push(`PR title: ${request.prTitle.trim()}`);
  }

  if (request.prBody?.trim()) {
    sections.push("PR description:", request.prBody.trim());
  }

  sections.push(
    "",
    "Diff (current branch vs base):",
    "```diff",
    request.diff.trim() || "(empty diff — treat as no code changes)",
    "```",
    "",
    "Use the repository on disk for additional context when needed; do not re-run git diff.",
  );

  return sections.join("\n");
}
