/**
 * One-off smoke: run ReviewAgent on a golden fixture and print latencyMs.
 *
 * Usage (from code-review/):
 *   npm run smoke:eval -- [fixture-id]
 *
 * Default fixture: pass-benign
 * Stdout remains ReviewOutput-shaped JSON (advisory CI contract).
 * Metrics (latencyMs, usage) go to stderr only.
 */
import { loadConfig } from "../src/config.js";
import { ReviewAgent, ReviewParseError, isStartupError } from "../src/review-agent.js";
import { loadFixture, listFixtureIds } from "./load-fixtures.js";

async function main(): Promise<void> {
  const fixtureId = process.argv[2]?.trim() || "pass-benign";
  const known = listFixtureIds();
  if (!known.includes(fixtureId)) {
    throw new Error(`Unknown fixture "${fixtureId}". Known: ${known.join(", ")}`);
  }

  const fixture = loadFixture(fixtureId);
  const config = loadConfig();
  const agent = new ReviewAgent(config);

  console.error(`smoke fixture=${fixture.id} expectedVerdict=${fixture.expectedVerdict}`);

  try {
    const result = await agent.review({
      diff: fixture.diff,
      prTitle: fixture.prTitle,
      prBody: fixture.prBody,
    });

    // Advisory CI contract: stdout is ReviewOutput only.
    process.stdout.write(`${JSON.stringify(result.review, null, 2)}\n`);

    const usageSuffix = result.usage
      ? ` usage.totalTokens=${result.usage.totalTokens}`
      : " usage=(none — latency-only)";
    console.error(
      `smoke ok status=${result.status} verdict=${result.review.verdict} latencyMs=${result.latencyMs}${usageSuffix}`,
    );
  } catch (error) {
    if (isStartupError(error)) {
      console.error(`Startup failed: ${error.message}`);
      process.exit(1);
    }
    if (error instanceof ReviewParseError) {
      console.error(error.message);
      process.exit(3);
    }
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
