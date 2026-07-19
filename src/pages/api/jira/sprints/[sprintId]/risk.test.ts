import { beforeEach, describe, expect, it, vi } from "vitest";
import { SECRET_PROBE } from "@/test/fixtures";
import { setupAuthenticatedJiraUser } from "@/test/jira-route-mocks";
import { mockAstroEnvServerWithServiceRole } from "@/test/mock-server-deps";
import { integrationTokenServiceMockModule } from "@/test/mock-integration-token-service";
import { supabaseClientMockModule } from "@/test/mock-supabase-client";
import { assertResponseBodyHasNoSecretProbe } from "@/test/secret-scan";

const { mockCreateAdminClient, mockComputeSprintRisk } = vi.hoisted(() => ({
  mockCreateAdminClient: vi.fn(),
  mockComputeSprintRisk: vi.fn(),
}));

vi.mock("astro:env/server", () => mockAstroEnvServerWithServiceRole);
vi.mock("@/lib/supabase", () => supabaseClientMockModule());
vi.mock("@/lib/supabase-admin", () => ({ createAdminClient: mockCreateAdminClient }));
vi.mock("@/lib/services/integration-token-service", () => integrationTokenServiceMockModule());
vi.mock("@/lib/services/risk-computation-service", () => ({ computeSprintRisk: mockComputeSprintRisk }));

import { GET } from "@/pages/api/jira/sprints/[sprintId]/risk";

describe("GET /api/jira/sprints/[sprintId]/risk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAdminClient.mockReturnValue({});
  });

  it("returns rows for an authenticated user with configured Jira and admin client", async () => {
    mockComputeSprintRisk.mockResolvedValue([
      {
        accountId: "acc-1",
        displayName: "Jane Doe",
        totalStoryPoints: 3,
        meetingHours: 1,
        contextSwitches: 2,
        riskBand: "low",
        status: "ok",
      },
    ]);

    const context = setupAuthenticatedJiraUser();
    context.params = { sprintId: "42" };

    const response = await GET(context);

    expect(response.status).toBe(200);
    await assertResponseBodyHasNoSecretProbe(response.clone(), SECRET_PROBE);
    const body = (await response.json()) as { sprintId: number; rows: unknown[] };
    expect(body.sprintId).toBe(42);
    expect(body.rows).toHaveLength(1);
  });

  it("rejects an invalid sprint ID", async () => {
    const context = setupAuthenticatedJiraUser();
    context.params = { sprintId: "not-a-number" };

    const response = await GET(context);

    expect(response.status).toBe(400);
    expect(mockComputeSprintRisk).not.toHaveBeenCalled();
  });

  it("returns 503 when the admin client cannot be constructed", async () => {
    mockCreateAdminClient.mockReturnValue(null);

    const context = setupAuthenticatedJiraUser();
    context.params = { sprintId: "42" };

    const response = await GET(context);

    expect(response.status).toBe(503);
    expect(mockComputeSprintRisk).not.toHaveBeenCalled();
  });
});
