/**
 * Dry assertion check (no Cursor API): prove mismatch fails and match passes.
 *
 * Usage (from code-review/):
 *   npm run eval:assert-check
 */
import { assertVerdictMatch } from "./assert-verdict.js";

function expectFail(label: string, result: boolean | string): void {
  if (result === true) {
    throw new Error(`${label}: expected assertion failure, got pass`);
  }
  console.error(`ok fail — ${label}: ${result}`);
}

function expectPass(label: string, result: boolean | string): void {
  if (result !== true) {
    throw new Error(`${label}: expected pass, got ${JSON.stringify(result)}`);
  }
  console.error(`ok pass — ${label}`);
}

function main(): void {
  // Deliberate mismatch (success criterion 2.1).
  expectFail(
    "mismatch pass vs fail",
    assertVerdictMatch({ verdict: "pass", status: "finished", latencyMs: 1 }, "fail"),
  );
  expectFail(
    "mismatch fail vs pass",
    assertVerdictMatch({ verdict: "fail", status: "finished", latencyMs: 1 }, "pass"),
  );

  expectPass("match fail", assertVerdictMatch({ verdict: "fail", status: "finished", latencyMs: 10 }, "fail"));
  expectPass("match pass", assertVerdictMatch({ verdict: "pass", status: "finished", latencyMs: 10 }, "pass"));

  console.error("eval:assert-check ok");
}

main();
