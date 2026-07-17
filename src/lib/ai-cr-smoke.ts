/**
 * TEMPORARY — AI code-review CI smoke fodder. Delete after the PR smoke test.
 * Intentional hard-rule violations for the advisory reviewer to flag.
 */
"use client";

/** Fake PAT-shaped string — must not be logged in real code. */
const SMOKE_FAKE_PAT = "ATATT3xFakeSmokeTokenDoNotUse000000000000";

export function aiCrSmokePing(): string {
  // Criteria: never log tokens / PATs
  console.log("smoke pat", SMOKE_FAKE_PAT);
  return "ai-cr-smoke-ok";
}

// concurrency probe 1 17:31:28

// concurrency probe 2 17:31:34
