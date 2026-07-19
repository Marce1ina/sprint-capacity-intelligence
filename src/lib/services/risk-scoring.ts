import type { RiskBand } from "@/types";

/** Each field is the exclusive lower bound at which the NEXT band starts. */
interface SignalThresholds {
  low: number;
  medium: number;
  high: number;
}

// Workload (story points): Low <=5, Medium 6-10, High 11-15, Critical >=16.
export const WORKLOAD_THRESHOLDS: SignalThresholds = { low: 6, medium: 11, high: 16 };
// Meeting hours: Low <5h, Medium 5-15h, High 15-25h, Critical >25h.
export const MEETING_HOURS_THRESHOLDS: SignalThresholds = { low: 5, medium: 15, high: 25 };
// Context switches: Low 0-3, Medium 4-8, High 9-15, Critical >=16.
export const CONTEXT_SWITCHES_THRESHOLDS: SignalThresholds = { low: 4, medium: 9, high: 16 };

export function bandForValue(value: number, thresholds: SignalThresholds): RiskBand {
  if (value < thresholds.low) return "low";
  if (value < thresholds.medium) return "medium";
  if (value < thresholds.high) return "high";
  return "critical";
}

const BAND_ORDER: RiskBand[] = ["low", "medium", "high", "critical"];

export function computeRiskBand(totalStoryPoints: number, meetingHours: number, contextSwitches: number): RiskBand {
  const bands = [
    bandForValue(totalStoryPoints, WORKLOAD_THRESHOLDS),
    bandForValue(meetingHours, MEETING_HOURS_THRESHOLDS),
    bandForValue(contextSwitches, CONTEXT_SWITCHES_THRESHOLDS),
  ];
  const highOrCriticalCount = bands.filter((band) => BAND_ORDER.indexOf(band) >= BAND_ORDER.indexOf("high")).length;

  return BAND_ORDER[highOrCriticalCount];
}
