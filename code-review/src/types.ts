import type { ReviewOutput } from "./review-schema.js";

export interface ReviewRequest {
  /** Precomputed patch (base...HEAD). */
  diff: string;
  prTitle?: string;
  prBody?: string;
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
