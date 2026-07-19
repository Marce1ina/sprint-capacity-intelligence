import { describe, expect, it } from "vitest";
import { computeRiskBand } from "@/lib/services/risk-scoring";

describe("computeRiskBand", () => {
  it("returns low when all three signals are low", () => {
    expect(computeRiskBand(5, 4, 3)).toBe("low");
  });

  it("returns medium when exactly one signal is high or critical (workload alone maxed out)", () => {
    // PRD scenario: workload maxed (>=16, critical) but meeting hours and context
    // switches stay low — triad rule caps this at medium, never critical alone.
    expect(computeRiskBand(20, 4, 3)).toBe("medium");
  });

  it("returns high when exactly two signals are high or critical", () => {
    expect(computeRiskBand(20, 20, 3)).toBe("high");
  });

  it("returns critical only when all three signals are high or critical", () => {
    expect(computeRiskBand(20, 30, 20)).toBe("critical");
  });

  it("stays overall low when meeting hours sit at the 5h boundary (medium band, not high)", () => {
    // 5h is the exclusive lower bound for the medium band, not high/critical,
    // so it doesn't count toward the "signals at High/Critical" tally.
    expect(computeRiskBand(0, 5, 0)).toBe("low");
  });
});
