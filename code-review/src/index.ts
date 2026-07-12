import { loadConfig } from "./config.js";
import { loadReviewRequest, parseArgs, printHelp } from "./cli.js";
import { ReviewAgent, ReviewParseError, isStartupError } from "./review-agent.js";

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));

  if (cli.help) {
    printHelp();
    return;
  }

  const config = loadConfig();
  const agent = new ReviewAgent(config);
  const request = loadReviewRequest();

  try {
    const result = await agent.review(request);
    process.stdout.write(`${JSON.stringify(result.review, null, 2)}\n`);
    console.error(`\nReview finished (status=${result.status}, verdict=${result.review.verdict})`);
  } catch (error) {
    if (isStartupError(error)) {
      console.error(`Startup failed: ${error.message} (retryable=${error.isRetryable})`);
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
