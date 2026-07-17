/**
 * Promptfoo custom provider: runs production ReviewAgent on a golden fixture.
 *
 * Config (per provider instance):
 *   modelId — Cursor model id (required)
 *   maxRounds — optional tool-round cap (default 5)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ApiProvider, CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";

import { loadEnvFile } from "../src/load-env.js";
import { ReviewAgent, ReviewParseError, ReviewRunError, isStartupError } from "../src/review-agent.js";
import type { ReviewAgentConfig } from "../src/types.js";
import { loadFixture } from "./load-fixtures.js";

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.join(EVAL_DIR, "..");
const MONOREPO_ROOT = path.join(PACKAGE_ROOT, "..");
const DEFAULT_MAX_ROUNDS = 5;

interface ProviderConfig {
  modelId?: string;
  maxRounds?: number;
}

export default class ReviewAgentProvider implements ApiProvider {
  readonly config: ProviderConfig;
  private readonly providerId: string;

  constructor(options: ProviderOptions) {
    this.config = (options.config ?? {}) as ProviderConfig;
    const modelId = this.config.modelId ?? "composer-2.5";
    this.providerId = options.id ?? `review-agent:${modelId}`;
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    loadEnvFile();

    const rawFixtureId = context?.vars.fixtureId;
    const fixtureId = typeof rawFixtureId === "string" ? rawFixtureId.trim() : "";
    if (!fixtureId) {
      return { error: "Provider requires vars.fixtureId" };
    }

    const modelId = this.config.modelId?.trim();
    if (!modelId) {
      return { error: "Provider config.modelId is required" };
    }

    const apiKey = process.env.CURSOR_API_KEY?.trim();
    if (!apiKey) {
      return { error: "CURSOR_API_KEY is required for eval runs" };
    }

    let fixture;
    try {
      fixture = loadFixture(fixtureId);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }

    try {
      const maxRounds = resolveMaxRounds(this.config.maxRounds);
      const agentConfig: ReviewAgentConfig = {
        apiKey,
        cwd: path.resolve(process.env.REVIEW_CWD ?? MONOREPO_ROOT),
        modelId,
        maxRounds,
      };

      const agent = new ReviewAgent(agentConfig);
      const result = await agent.review({
        diff: fixture.diff,
        prTitle: fixture.prTitle,
        prBody: fixture.prBody,
      });

      const output = {
        ...result.review,
        status: result.status,
        latencyMs: result.latencyMs,
        ...(result.usage ? { usage: result.usage } : {}),
        modelId,
        fixtureId,
      };

      return {
        output,
        tokenUsage: result.usage
          ? {
              total: result.usage.totalTokens,
              prompt: result.usage.inputTokens,
              completion: result.usage.outputTokens,
            }
          : undefined,
        metadata: {
          latencyMs: result.latencyMs,
          status: result.status,
          agentId: result.agentId,
          runId: result.runId,
          modelId,
          fixtureId,
          expectedVerdict: fixture.expectedVerdict,
        },
      };
    } catch (error) {
      if (isStartupError(error)) {
        return { error: `Startup failed: ${error.message}` };
      }
      if (error instanceof ReviewParseError) {
        return { error: `Parse failed: ${error.message}` };
      }
      if (error instanceof ReviewRunError) {
        return {
          error: `Run failed: ${error.message}`,
          metadata: {
            latencyMs: error.details.latencyMs,
            status: error.details.status,
            agentId: error.details.agentId,
            runId: error.details.runId,
            modelId,
            fixtureId,
          },
        };
      }
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}

function resolveMaxRounds(value: number | undefined): number {
  if (value === undefined) {
    const fromEnv = process.env.REVIEW_MAX_ROUNDS?.trim();
    if (!fromEnv) return DEFAULT_MAX_ROUNDS;
    const parsed = Number.parseInt(fromEnv, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error(`REVIEW_MAX_ROUNDS must be a positive integer, got "${fromEnv}"`);
    }
    return parsed;
  }
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`maxRounds must be a positive integer, got "${value}"`);
  }
  return value;
}
