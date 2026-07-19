import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SprintInviteService } from "@/lib/services/sprint-invite-service";

function fakeSupabase(rows: unknown[]): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: (column: string, value: unknown) => {
          expect(column).toBe("sprint_id");
          expect(value).toBe(42);
          return Promise.resolve({ data: rows, error: null });
        },
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("SprintInviteService.getInvitesBySprintId", () => {
  it("returns invites for the given sprint mapped to camelCase SprintInvite shape", async () => {
    const service = new SprintInviteService(
      fakeSupabase([
        {
          id: "inv-1",
          sprint_id: 42,
          jira_account_id: "acc-1",
          jira_display_name: "Jane Doe",
          invited_by: "em-1",
          token: "tok-1",
          status: "consumed",
          connected_user_id: "user-1",
          created_at: "2026-07-01T00:00:00.000Z",
          consumed_at: "2026-07-02T00:00:00.000Z",
        },
      ]),
    );

    const invites = await service.getInvitesBySprintId(42);

    expect(invites).toEqual([
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
        consumedAt: "2026-07-02T00:00:00.000Z",
      },
    ]);
  });
});
