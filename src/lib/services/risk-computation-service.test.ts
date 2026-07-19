import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockGetGoogleCalendarTokens, integrationTokenServiceMockModule } from "@/test/mock-integration-token-service";
import { mockGetInvitesBySprintId, sprintInviteServiceMockModule } from "@/test/mock-sprint-invite-service";

const { mockGetSprintAssignees, mockGetSprintById, mockFetchCalendarEvents } = vi.hoisted(() => ({
  mockGetSprintAssignees: vi.fn(),
  mockGetSprintById: vi.fn(),
  mockFetchCalendarEvents: vi.fn(),
}));
vi.mock("@/lib/services/jira-client", () => ({
  getSprintAssignees: mockGetSprintAssignees,
  getSprintById: mockGetSprintById,
}));
vi.mock("@/lib/services/integration-token-service", () => integrationTokenServiceMockModule());
vi.mock("@/lib/services/sprint-invite-service", () => sprintInviteServiceMockModule());
vi.mock("@/lib/services/google-calendar-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/google-calendar-client")>(
    "@/lib/services/google-calendar-client",
  );
  return { ...actual, fetchCalendarEvents: mockFetchCalendarEvents };
});

import { computeSprintRisk } from "@/lib/services/risk-computation-service";

const BASE_ARGS = {
  siteUrl: "https://example.atlassian.net",
  pat: "test-pat",
  accountEmail: "em@example.com",
  sprintId: 42,
  supabase: {} as unknown as SupabaseClient,
  adminClient: {} as unknown as SupabaseClient,
  encryptionKey: "test-key",
};

describe("computeSprintRisk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSprintById.mockResolvedValue({
      id: 42,
      name: "Sprint 42",
      state: "active",
      startDate: "2026-07-01T00:00:00.000Z",
      endDate: "2026-07-14T00:00:00.000Z",
    });
  });

  it("returns an ok row with computed metrics for a connected assignee with a valid token", async () => {
    mockGetSprintAssignees.mockResolvedValue([{ accountId: "acc-1", displayName: "Jane Doe", totalStoryPoints: 3 }]);
    mockGetInvitesBySprintId.mockResolvedValue([
      {
        id: "inv-1",
        sprintId: 42,
        jiraAccountId: "acc-1",
        jiraDisplayName: "Jane Doe",
        invitedBy: "em-1",
        token: "tok-1",
        status: "consumed",
        connectedUserId: "user-1",
        createdAt: "2026-07-01T00:00:00.000Z",
        consumedAt: "2026-07-01T00:00:00.000Z",
      },
    ]);
    mockGetGoogleCalendarTokens.mockResolvedValue({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: "2999-01-01T00:00:00.000Z",
      scopes: ["calendar.readonly"],
    });
    mockFetchCalendarEvents.mockResolvedValue([]);

    const rows = await computeSprintRisk(BASE_ARGS);

    expect(rows).toEqual([
      {
        accountId: "acc-1",
        displayName: "Jane Doe",
        totalStoryPoints: 3,
        meetingHours: 0,
        contextSwitches: 0,
        riskBand: "low",
        status: "ok",
      },
    ]);
  });

  it("marks the row reconnect_required when the stored token has expired, without calling Calendar", async () => {
    mockGetSprintAssignees.mockResolvedValue([{ accountId: "acc-1", displayName: "Jane Doe", totalStoryPoints: 3 }]);
    mockGetInvitesBySprintId.mockResolvedValue([
      {
        id: "inv-1",
        sprintId: 42,
        jiraAccountId: "acc-1",
        jiraDisplayName: "Jane Doe",
        invitedBy: "em-1",
        token: "tok-1",
        status: "consumed",
        connectedUserId: "user-1",
        createdAt: "2026-07-01T00:00:00.000Z",
        consumedAt: "2026-07-01T00:00:00.000Z",
      },
    ]);
    mockGetGoogleCalendarTokens.mockResolvedValue({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: "2020-01-01T00:00:00.000Z",
      scopes: ["calendar.readonly"],
    });

    const rows = await computeSprintRisk(BASE_ARGS);

    expect(rows).toEqual([
      {
        accountId: "acc-1",
        displayName: "Jane Doe",
        totalStoryPoints: 3,
        meetingHours: 0,
        contextSwitches: 0,
        riskBand: "low",
        status: "reconnect_required",
      },
    ]);
    expect(mockFetchCalendarEvents).not.toHaveBeenCalled();
  });

  it("marks the row error when the Calendar fetch itself fails", async () => {
    mockGetSprintAssignees.mockResolvedValue([{ accountId: "acc-1", displayName: "Jane Doe", totalStoryPoints: 3 }]);
    mockGetInvitesBySprintId.mockResolvedValue([
      {
        id: "inv-1",
        sprintId: 42,
        jiraAccountId: "acc-1",
        jiraDisplayName: "Jane Doe",
        invitedBy: "em-1",
        token: "tok-1",
        status: "consumed",
        connectedUserId: "user-1",
        createdAt: "2026-07-01T00:00:00.000Z",
        consumedAt: "2026-07-01T00:00:00.000Z",
      },
    ]);
    mockGetGoogleCalendarTokens.mockResolvedValue({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: "2999-01-01T00:00:00.000Z",
      scopes: ["calendar.readonly"],
    });
    const { CalendarApiError } = await import("@/lib/services/google-calendar-client");
    mockFetchCalendarEvents.mockRejectedValue(new CalendarApiError("boom"));

    const rows = await computeSprintRisk(BASE_ARGS);

    expect(rows).toEqual([
      {
        accountId: "acc-1",
        displayName: "Jane Doe",
        totalStoryPoints: 3,
        meetingHours: 0,
        contextSwitches: 0,
        riskBand: "low",
        status: "error",
      },
    ]);
  });

  it("omits invites that are not consumed or have no connected user", async () => {
    mockGetSprintAssignees.mockResolvedValue([]);
    mockGetInvitesBySprintId.mockResolvedValue([
      {
        id: "inv-1",
        sprintId: 42,
        jiraAccountId: "acc-1",
        jiraDisplayName: "Jane Doe",
        invitedBy: "em-1",
        token: "tok-1",
        status: "pending",
        connectedUserId: null,
        createdAt: "2026-07-01T00:00:00.000Z",
        consumedAt: null,
      },
    ]);

    const rows = await computeSprintRisk(BASE_ARGS);

    expect(rows).toEqual([]);
    expect(mockGetGoogleCalendarTokens).not.toHaveBeenCalled();
  });
});
