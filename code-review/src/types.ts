import type { ReviewOutput } from "./review-schema.js";

export type ReviewScope = "branch" | "uncommitted" | "natural";

export interface ReviewRequest {
  scope: ReviewScope;
  /** Base ref for branch reviews, e.g. `main` or `origin/main`. */
  baseRef?: string;
  /** Free-form instructions appended to the review prompt. */
  instructions?: string;
  /** When scope is `natural`, the full prompt body. */
  customPrompt?: string;
}

export interface ReviewAgentConfig {
  apiKey: string;
  cwd: string;
  modelId: string;
  /** Max agent tool-use rounds before the run is cancelled. */
  maxRounds: number;
}

export interface ReviewResult {
  agentId: string;
  runId: string;
  status: "finished" | "error" | "cancelled";
  text: string;
  review: ReviewOutput;
}
