import { SYSTEM_PROMPT, buildOutputInstructions } from "./review-schema.js";
import type { ReviewRequest } from "./types.js";

export function buildReviewPrompt(request: ReviewRequest): string {
  const sections = [SYSTEM_PROMPT, ""];

  if (request.scope === "natural" && request.customPrompt) {
    sections.push(request.customPrompt, "");
  } else {
    sections.push(scopeInstructions(request), "");

    if (request.instructions?.trim()) {
      sections.push("Additional instructions:", request.instructions.trim(), "");
    }
  }

  sections.push(buildOutputInstructions());
  return sections.join("\n");
}

function scopeInstructions(request: ReviewRequest): string {
  switch (request.scope) {
    case "branch":
      return [
        "Review the diff for the current branch against the base branch.",
        `Base ref: ${request.baseRef ?? "main"}`,
        "Use git to inspect changes; do not assume unstaged edits unless relevant.",
      ].join("\n");
    case "uncommitted":
      return [
        "Review uncommitted changes in the working tree.",
        "Include staged and unstaged edits; mention if the tree is clean.",
      ].join("\n");
    case "natural":
      return "Review the codebase changes described above.";
  }
}
