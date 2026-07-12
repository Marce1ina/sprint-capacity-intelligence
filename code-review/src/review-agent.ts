import { Agent, CursorAgentError } from "@cursor/sdk";

import { parseReviewResponse, ReviewParseError } from "./review-schema.js";
import type { ReviewAgentConfig, ReviewRequest, ReviewResult } from "./types.js";
import { buildReviewPrompt } from "./prompts.js";

export { ReviewParseError };

export class ReviewAgent {
  constructor(private readonly config: ReviewAgentConfig) {}

  async review(request: ReviewRequest): Promise<ReviewResult> {
    const prompt = buildReviewPrompt(request);

    await using agent = await Agent.create({
      apiKey: this.config.apiKey,
      model: { id: this.config.modelId },
      local: {
        cwd: this.config.cwd,
        settingSources: [],
      },
    });

    let toolRound = 0;
    let sawToolCalls = false;
    const roundCapState = { cancelled: false };

    const runRef = await agent.send(prompt, {
      onStep: ({ step }) => {
        if (step.type === "toolCall") {
          if (toolRound >= this.config.maxRounds) {
            if (!roundCapState.cancelled && runRef.supports("cancel")) {
              roundCapState.cancelled = true;
              console.error(`\nMax tool rounds (${this.config.maxRounds}) reached; cancelling.`);
              void runRef.cancel();
            }
            return;
          }
          sawToolCalls = true;
          return;
        }

        if (step.type === "assistantMessage" && sawToolCalls) {
          toolRound += 1;
          sawToolCalls = false;
        }
      },
    });

    console.error(`agent=${agent.agentId} run=${runRef.id} maxRounds=${this.config.maxRounds}`);

    let text = "";

    for await (const event of runRef.stream()) {
      if (event.type !== "assistant") continue;

      for (const block of event.message.content) {
        if (block.type === "text") {
          text += block.text;
          process.stderr.write(block.text);
        }
      }
    }

    const result = await runRef.wait();

    if (result.status === "cancelled" && roundCapState.cancelled) {
      return finalizeReview(agent.agentId, runRef.id, "cancelled", text);
    }

    if (result.status === "error") {
      throw new ReviewRunError(`Review run failed (run=${runRef.id}, agent=${agent.agentId})`, {
        agentId: agent.agentId,
        runId: runRef.id,
        status: "error",
        text,
      });
    }

    return finalizeReview(agent.agentId, runRef.id, result.status, text);
  }
}

function finalizeReview(agentId: string, runId: string, status: ReviewResult["status"], text: string): ReviewResult {
  return {
    agentId,
    runId,
    status,
    text,
    review: parseReviewResponse(text),
  };
}

export class ReviewRunError extends Error {
  constructor(
    message: string,
    readonly details: Pick<ReviewResult, "agentId" | "runId" | "status" | "text">,
  ) {
    super(message);
    this.name = "ReviewRunError";
  }
}

export function isStartupError(error: unknown): error is CursorAgentError {
  return error instanceof CursorAgentError;
}
