import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockApiContext, createMockUser } from "@/test/mock-api-context";
import { mockCreateOrGetInvite, sprintInviteServiceMockModule } from "@/test/mock-sprint-invite-service";
import { supabaseClientMockModule } from "@/test/mock-supabase-client";

vi.mock("@/lib/supabase", () => supabaseClientMockModule());
vi.mock("@/lib/services/sprint-invite-service", () => sprintInviteServiceMockModule());

import { POST } from "@/pages/api/jira/sprints/[sprintId]/invites";

describe("POST /api/jira/sprints/[sprintId]/invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an invite for an authenticated user and returns a shareable URL", async () => {
    mockCreateOrGetInvite.mockResolvedValue({ token: "test-token-123" });

    const context = createMockApiContext({
      url: "http://localhost/api/jira/sprints/10/invites",
      method: "POST",
      user: createMockUser(),
    });
    context.params = { sprintId: "10" };
    context.request = new Request(context.url.toString(), {
      method: "POST",
      body: JSON.stringify({ jiraAccountId: "acc-1", jiraDisplayName: "Jane Doe" }),
    });

    const response = await POST(context);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { url: string };
    expect(body.url).toBe("http://localhost/invite/test-token-123");
    expect(mockCreateOrGetInvite).toHaveBeenCalledWith("user-test-id", 10, "acc-1", "Jane Doe");
  });

  it("rejects unauthenticated requests", async () => {
    const context = createMockApiContext({
      url: "http://localhost/api/jira/sprints/10/invites",
      method: "POST",
      user: null,
    });
    context.params = { sprintId: "10" };

    const response = await POST(context);
    expect(response.status).toBe(401);
    expect(mockCreateOrGetInvite).not.toHaveBeenCalled();
  });

  it("rejects an invalid sprint ID", async () => {
    const context = createMockApiContext({
      url: "http://localhost/api/jira/sprints/abc/invites",
      method: "POST",
      user: createMockUser(),
    });
    context.params = { sprintId: "abc" };

    const response = await POST(context);
    expect(response.status).toBe(400);
    expect(mockCreateOrGetInvite).not.toHaveBeenCalled();
  });
});
