import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CalendarApiError,
  computeMeetingMetrics,
  fetchCalendarEvents,
  isTokenExpired,
} from "@/lib/services/google-calendar-client";
import { IntegrationTokenService } from "@/lib/services/integration-token-service";
import { getSprintAssignees, getSprintById } from "@/lib/services/jira-client";
import { computeRiskBand } from "@/lib/services/risk-scoring";
import { SprintInviteService } from "@/lib/services/sprint-invite-service";
import type { AssigneeRiskRow, RiskBand } from "@/types";

interface ComputeSprintRiskArgs {
  siteUrl: string;
  pat: string;
  accountEmail: string;
  sprintId: number;
  supabase: SupabaseClient;
  adminClient: SupabaseClient;
  encryptionKey: string;
}

const BAND_SEVERITY: Record<RiskBand, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export async function computeSprintRisk({
  siteUrl,
  pat,
  accountEmail,
  sprintId,
  supabase,
  adminClient,
  encryptionKey,
}: ComputeSprintRiskArgs): Promise<AssigneeRiskRow[]> {
  const [assignees, sprint] = await Promise.all([
    getSprintAssignees(siteUrl, pat, accountEmail, sprintId),
    getSprintById(siteUrl, pat, accountEmail, sprintId),
  ]);
  const workloadByAccountId = new Map(assignees.map((assignee) => [assignee.accountId, assignee.totalStoryPoints]));

  const invites = await new SprintInviteService(supabase).getInvitesBySprintId(sprintId);
  const connectedInvites = invites.filter(
    (invite): invite is typeof invite & { connectedUserId: string } =>
      invite.status === "consumed" && invite.connectedUserId !== null,
  );

  const tokenService = new IntegrationTokenService(adminClient, encryptionKey);

  const rows = await Promise.all(
    connectedInvites.map(async (invite): Promise<AssigneeRiskRow> => {
      const totalStoryPoints = workloadByAccountId.get(invite.jiraAccountId) ?? 0;

      const token = await tokenService.getGoogleCalendarTokens(invite.connectedUserId);
      if (token === null || isTokenExpired(token)) {
        return {
          accountId: invite.jiraAccountId,
          displayName: invite.jiraDisplayName,
          totalStoryPoints,
          meetingHours: 0,
          contextSwitches: 0,
          riskBand: computeRiskBand(totalStoryPoints, 0, 0),
          status: "reconnect_required",
        };
      }

      try {
        const events = await fetchCalendarEvents(
          token.accessToken,
          sprint.startDate ?? new Date(0).toISOString(),
          sprint.endDate ?? new Date().toISOString(),
        );
        const { meetingHours, contextSwitches } = computeMeetingMetrics(
          events,
          sprint.startDate ?? new Date(0).toISOString(),
          sprint.endDate ?? new Date().toISOString(),
        );

        return {
          accountId: invite.jiraAccountId,
          displayName: invite.jiraDisplayName,
          totalStoryPoints,
          meetingHours,
          contextSwitches,
          riskBand: computeRiskBand(totalStoryPoints, meetingHours, contextSwitches),
          status: "ok",
        };
      } catch (error) {
        if (error instanceof CalendarApiError) {
          return {
            accountId: invite.jiraAccountId,
            displayName: invite.jiraDisplayName,
            totalStoryPoints,
            meetingHours: 0,
            contextSwitches: 0,
            riskBand: computeRiskBand(totalStoryPoints, 0, 0),
            status: "error",
          };
        }
        throw error;
      }
    }),
  );

  return rows.sort((a, b) => {
    const severityDiff = BAND_SEVERITY[b.riskBand] - BAND_SEVERITY[a.riskBand];
    if (severityDiff !== 0) return severityDiff;
    return a.displayName.localeCompare(b.displayName);
  });
}
