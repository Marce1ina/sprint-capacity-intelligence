/**
 * Shared verdict-match helper used by dry assert-check (no Cursor API).
 * Keep in sync with the javascript assertion string in generate-tests.ts.
 */
export function assertVerdictMatch(output: unknown, expectedVerdict: string): boolean | string {
  if (expectedVerdict !== "pass" && expectedVerdict !== "fail") {
    return `Invalid expectedVerdict: ${JSON.stringify(expectedVerdict)}`;
  }

  let verdict: unknown;
  if (output && typeof output === "object" && "verdict" in output) {
    verdict = (output as { verdict?: unknown }).verdict;
  } else if (typeof output === "string") {
    try {
      verdict = (JSON.parse(output) as { verdict?: unknown }).verdict;
    } catch {
      return `Output is not JSON with a verdict: ${output.slice(0, 120)}`;
    }
  } else {
    return `Unexpected output shape: ${typeof output}`;
  }

  if (verdict !== expectedVerdict) {
    return `Expected verdict "${expectedVerdict}" but got "${String(verdict)}"`;
  }
  return true;
}
