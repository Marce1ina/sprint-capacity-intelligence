import { z } from "zod";

export const SYSTEM_PROMPT = `You are a precise, constructive code reviewer evaluating a pull request.
Score the provided diff on five criteria on a scale of 1-10 (1 = serious gaps, 10 = exemplary):
implementation correctness, idiomaticity, complexity, test coverage relative to risk, security.
Then issue a binding verdict (pass/fail) for the overall change and include a brief summary (2-3 sentences)
in Markdown that the PR author can act on.`;

// Scores use plain z.number(): structured output providers reject min/max on integer
// types, so the 1-10 range is enforced via field descriptions and the prompt, not the schema.
export const REVIEW_SCHEMA = z.object({
  implementationCorrectness: z
    .number()
    .describe("Implementation correctness: whether the code does what it claims (scale 1-10)"),
  idiomaticity: z.number().describe("Idiomaticity: alignment with language and project conventions (scale 1-10)"),
  complexity: z.number().describe("Complexity: simplicity of the solution relative to the problem (scale 1-10)"),
  testRiskCoverage: z.number().describe("Test coverage proportional to risk of changed paths (scale 1-10)"),
  securitySafety: z.number().describe("Security: no vulnerabilities or secret leaks (scale 1-10)"),
  verdict: z.enum(["pass", "fail"]).describe("Binding verdict for the overall change"),
  summary: z.string().describe("Summary in Markdown, ready to post as a PR comment"),
});

export type ReviewOutput = z.infer<typeof REVIEW_SCHEMA>;

const REVIEW_JSON_KEYS = [
  "implementationCorrectness",
  "idiomaticity",
  "complexity",
  "testRiskCoverage",
  "securitySafety",
  "verdict",
  "summary",
] as const satisfies readonly (keyof ReviewOutput)[];

export function buildOutputInstructions(): string {
  const fieldLines = REVIEW_JSON_KEYS.map((key) => {
    const description = REVIEW_SCHEMA.shape[key].description ?? key;
    return `- ${key}: ${description}`;
  });

  return [
    "Output requirements:",
    "- After inspecting the diff, respond with ONLY a single JSON object.",
    "- Do not wrap the JSON in markdown fences or add commentary outside the JSON.",
    "- Each score must be an integer from 1 to 10.",
    '- verdict must be exactly "pass" or "fail".',
    "- summary must be Markdown suitable as a PR comment (2-3 sentences).",
    "",
    "Required JSON fields:",
    ...fieldLines,
  ].join("\n");
}

export class ReviewParseError extends Error {
  constructor(
    message: string,
    readonly rawText: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ReviewParseError";
  }
}

export function parseReviewResponse(text: string): ReviewOutput {
  let parsed: unknown;

  try {
    parsed = JSON.parse(extractJson(text));
  } catch (error) {
    throw new ReviewParseError("Review response is not valid JSON.", text, error);
  }

  const result = REVIEW_SCHEMA.safeParse(parsed);
  if (!result.success) {
    throw new ReviewParseError(`Review response failed schema validation: ${result.error.message}`, text, result.error);
  }

  return result.data;
}

function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced?.[1]) return fenced[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return text.slice(start, end + 1);
  }

  return text.trim();
}
