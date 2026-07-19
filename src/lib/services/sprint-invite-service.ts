import type { SupabaseClient } from "@supabase/supabase-js";
import type { SprintInvite, SprintInviteStatus } from "@/types";

interface SprintInviteRow {
  id: string;
  sprint_id: number;
  jira_account_id: string;
  jira_display_name: string;
  invited_by: string;
  token: string;
  status: SprintInviteStatus;
  connected_user_id: string | null;
  created_at: string;
  consumed_at: string | null;
}

function toSprintInvite(row: SprintInviteRow): SprintInvite {
  return {
    id: row.id,
    sprintId: row.sprint_id,
    jiraAccountId: row.jira_account_id,
    jiraDisplayName: row.jira_display_name,
    invitedBy: row.invited_by,
    token: row.token,
    status: row.status,
    connectedUserId: row.connected_user_id,
    createdAt: row.created_at,
    consumedAt: row.consumed_at,
  };
}

/** base64url (not base64) — the token lands directly in a URL path segment. */
function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export class SprintInviteService {
  constructor(private supabase: SupabaseClient) {}

  async createOrGetInvite(
    invitedBy: string,
    sprintId: number,
    jiraAccountId: string,
    jiraDisplayName: string,
  ): Promise<{ token: string }> {
    const { data: existing, error: selectError } = await this.supabase
      .from("sprint_invites")
      .select("token")
      .eq("sprint_id", sprintId)
      .eq("jira_account_id", jiraAccountId)
      .maybeSingle();

    if (selectError) {
      throw selectError;
    }

    if (existing) {
      return { token: existing.token as string };
    }

    const token = generateInviteToken();
    const { error: insertError } = await this.supabase.from("sprint_invites").insert({
      sprint_id: sprintId,
      jira_account_id: jiraAccountId,
      jira_display_name: jiraDisplayName,
      invited_by: invitedBy,
      token,
    });

    if (insertError) {
      throw insertError;
    }

    return { token };
  }

  async getInviteByToken(token: string): Promise<SprintInvite | null> {
    const { data, error } = await this.supabase
      .from("sprint_invites")
      .select(
        "id, sprint_id, jira_account_id, jira_display_name, invited_by, token, status, connected_user_id, created_at, consumed_at",
      )
      .eq("token", token)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return null;
    }

    return toSprintInvite(data);
  }

  async getInvitesBySprintId(sprintId: number): Promise<SprintInvite[]> {
    const { data, error } = await this.supabase
      .from("sprint_invites")
      .select(
        "id, sprint_id, jira_account_id, jira_display_name, invited_by, token, status, connected_user_id, created_at, consumed_at",
      )
      .eq("sprint_id", sprintId);

    if (error) {
      throw error;
    }

    return (data as SprintInviteRow[]).map(toSprintInvite);
  }

  async markConsumed(token: string, connectedUserId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("sprint_invites")
      .update({
        status: "consumed",
        connected_user_id: connectedUserId,
        consumed_at: new Date().toISOString(),
      })
      .eq("token", token)
      .eq("status", "pending")
      .select("id");

    if (error) {
      throw error;
    }

    return data.length > 0;
  }
}
