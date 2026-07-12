import type { ReviewRequest, ReviewScope } from "./types.js";

export interface CliOptions {
  scope: ReviewScope;
  baseRef?: string;
  instructions?: string;
  customPrompt?: string;
  help: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    scope: "branch",
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--scope":
        options.scope = parseScope(requireValue(argv, ++i, arg));
        break;
      case "--base":
        options.baseRef = requireValue(argv, ++i, arg);
        break;
      case "--instructions":
        options.instructions = requireValue(argv, ++i, arg);
        break;
      case "--prompt":
        options.customPrompt = requireValue(argv, ++i, arg);
        options.scope = "natural";
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parseScope(value: string): ReviewScope {
  if (value === "branch" || value === "uncommitted" || value === "natural") {
    return value;
  }

  throw new Error(`Invalid --scope "${value}". Expected branch | uncommitted | natural.`);
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

export function printHelp(): void {
  console.log(`Usage: npm run review -- [options]

Options:
  --scope <branch|uncommitted|natural>  What to review (default: branch)
  --base <ref>                          Base git ref for branch reviews (default: main)
  --instructions <text>                 Extra review instructions
  --prompt <text>                       Full custom prompt (sets scope to natural)
  -h, --help                            Show this help

Environment:
  CURSOR_API_KEY   Required Cursor API key
  REVIEW_CWD       Repo root for the local agent (default: parent of code-review/)
  REVIEW_MODEL     Model id (default: composer-2.5)

Examples:
  npm run review
  npm run review -- --scope uncommitted
  npm run review -- --base origin/main --instructions "Check auth changes only"
`);
}

export function toReviewRequest(options: CliOptions): ReviewRequest {
  return {
    scope: options.scope,
    baseRef: options.baseRef ?? "main",
    instructions: options.instructions,
    customPrompt: options.customPrompt,
  };
}
