/**
 * Dynamic Promptfoo tests: one case per golden fixture.
 * Assert schema-shaped output + expected verdict equality.
 */
import { loadAllFixtures } from "./load-fixtures.js";

const VERDICT_ASSERT = `
const expected = context.vars.expectedVerdict;
if (expected !== "pass" && expected !== "fail") {
  return "Invalid expectedVerdict: " + JSON.stringify(expected);
}
let verdict;
if (output && typeof output === "object" && "verdict" in output) {
  verdict = output.verdict;
} else if (typeof output === "string") {
  try { verdict = JSON.parse(output).verdict; }
  catch { return "Output is not JSON with a verdict"; }
} else {
  return "Unexpected output shape: " + typeof output;
}
if (verdict !== expected) {
  return 'Expected verdict "' + expected + '" but got "' + verdict + '"';
}
return true;
`.trim();

export default function generateTests() {
  return loadAllFixtures().map((fixture) => ({
    description: `${fixture.id} → expected ${fixture.expectedVerdict}`,
    vars: {
      fixtureId: fixture.id,
      expectedVerdict: fixture.expectedVerdict,
    },
    assert: [
      {
        type: "is-json",
        value: {
          type: "object",
          required: ["verdict", "status", "latencyMs"],
          properties: {
            verdict: { type: "string", enum: ["pass", "fail"] },
            status: { type: "string" },
            latencyMs: { type: "number" },
          },
        },
      },
      {
        type: "javascript",
        value: VERDICT_ASSERT,
      },
    ],
  }));
}
