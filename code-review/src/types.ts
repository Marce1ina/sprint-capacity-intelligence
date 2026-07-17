import type { TokenUsage } from "@cursor/sdk";

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
  /** Wall-clock ms from agent create through run wait. */
  latencyMs: number;
  /** Cumulative token usage from `runRef.wait()` when the SDK reports it. */
  usage?: TokenUsage;
}
