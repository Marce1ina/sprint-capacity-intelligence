import { afterEach, describe, expect, it, vi } from "vitest";
import { SECRET_PROBE } from "@/test/fixtures";
import { assertNoSecretProbe } from "@/test/secret-scan";
import {
  CalendarApiError,
  computeMeetingMetrics,
  fetchCalendarEvents,
  isTokenExpired,
} from "@/lib/services/google-calendar-client";

const SPRINT_START = "2026-07-01T00:00:00.000Z";
const SPRINT_END = "2026-07-14T00:00:00.000Z";

describe("isTokenExpired", () => {
  it("returns true when expiresAt is in the past", () => {
    expect(isTokenExpired({ expiresAt: "2020-01-01T00:00:00.000Z" })).toBe(true);
  });

  it("returns false when expiresAt is in the future", () => {
    expect(isTokenExpired({ expiresAt: "2999-01-01T00:00:00.000Z" })).toBe(false);
  });
});

describe("computeMeetingMetrics", () => {
  it("sums duration and counts one work-meeting round trip for a single timed event", () => {
    const events = [{ start: { dateTime: "2026-07-02T09:00:00.000Z" }, end: { dateTime: "2026-07-02T10:00:00.000Z" } }];

    expect(computeMeetingMetrics(events, SPRINT_START, SPRINT_END)).toEqual({
      meetingHours: 1,
      contextSwitches: 2,
    });
  });

  it("excludes all-day events (date field, no dateTime) from both metrics", () => {
    const events = [{ start: { date: "2026-07-02" }, end: { date: "2026-07-03" } }];

    expect(computeMeetingMetrics(events, SPRINT_START, SPRINT_END)).toEqual({
      meetingHours: 0,
      contextSwitches: 0,
    });
  });

  it("merges back-to-back events (zero gap) into a single block — no switch mid-block", () => {
    const events = [
      { start: { dateTime: "2026-07-02T09:00:00.000Z" }, end: { dateTime: "2026-07-02T10:00:00.000Z" } },
      { start: { dateTime: "2026-07-02T10:00:00.000Z" }, end: { dateTime: "2026-07-02T11:00:00.000Z" } },
    ];

    expect(computeMeetingMetrics(events, SPRINT_START, SPRINT_END)).toEqual({
      meetingHours: 2,
      contextSwitches: 2,
    });
  });

  it("counts a separate round trip when there's any gap between two meetings", () => {
    const events = [
      { start: { dateTime: "2026-07-02T09:00:00.000Z" }, end: { dateTime: "2026-07-02T10:00:00.000Z" } },
      { start: { dateTime: "2026-07-02T10:15:00.000Z" }, end: { dateTime: "2026-07-02T11:00:00.000Z" } },
    ];

    expect(computeMeetingMetrics(events, SPRINT_START, SPRINT_END)).toEqual({
      meetingHours: 1.75,
      contextSwitches: 4,
    });
  });
});

describe("fetchCalendarEvents", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("paginates via nextPageToken and returns the combined events", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [{ start: {}, end: {} }], nextPageToken: "page-2" }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ start: {}, end: {} }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const events = await fetchCalendarEvents(SECRET_PROBE, SPRINT_START, SPRINT_END);

    expect(events).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws CalendarApiError without echoing the access token on non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: `bad token ${SECRET_PROBE}` }), { status: 401 })),
    );

    await expect(fetchCalendarEvents(SECRET_PROBE, SPRINT_START, SPRINT_END)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(CalendarApiError);
      const apiError = error as CalendarApiError;
      assertNoSecretProbe({ message: apiError.userMessage }, SECRET_PROBE);
      return true;
    });
  });
});
