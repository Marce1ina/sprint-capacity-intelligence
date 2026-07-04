import type { User } from "@supabase/supabase-js";
import { vi } from "vitest";
import { SECRET_PROBE, TEST_JIRA_SITE } from "@/test/fixtures";
import { createMockApiContext, createMockUser } from "@/test/mock-api-context";
import { mockGetJiraPat } from "@/test/mock-integration-token-service";
import { mockSupabaseCreateClient } from "@/test/mock-supabase-client";

export function setupAuthenticatedJiraUser(user: User = createMockUser()): ReturnType<typeof createMockApiContext> {
  mockSupabaseCreateClient.mockReturnValue({});
  mockGetJiraPat.mockResolvedValue({
    pat: SECRET_PROBE,
    siteUrl: TEST_JIRA_SITE,
  });

  return createMockApiContext({ user });
}

export function mockJiraFetchSuccess(body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

export function mockJiraFetchUnauthorized(probeInBody = SECRET_PROBE): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: `Invalid token ${probeInBody}` }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

export const boardsPage = {
  values: [{ id: 1, name: "Team Board", type: "scrum" }],
  startAt: 0,
  maxResults: 50,
  isLast: true,
};

export const sprintsPage = {
  values: [{ id: 10, name: "Sprint 1", state: "active" }],
  startAt: 0,
  maxResults: 50,
  isLast: true,
};

export const sprintIssuesPage = {
  issues: [
    {
      key: "T-1",
      fields: {
        assignee: { accountId: "a1", displayName: "Alice" },
        storyPoints: 3,
        summary: "Task one",
      },
    },
  ],
  startAt: 0,
  maxResults: 50,
  isLast: true,
};
