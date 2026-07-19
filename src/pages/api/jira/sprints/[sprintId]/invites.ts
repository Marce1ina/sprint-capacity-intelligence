import type { APIRoute } from "astro";
import { jsonError } from "@/lib/jira-api-context";
import { parsePositiveInt } from "@/lib/parse-route-id";
import { SprintInviteService } from "@/lib/services/sprint-invite-service";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return jsonError(401, "Authentication required.");
  }

  const sprintId = parsePositiveInt(context.params.sprintId);
  if (sprintId === null) {
    return jsonError(400, "Invalid sprint ID.");
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError(400, "Invalid request body.");
  }

  const { jiraAccountId, jiraDisplayName } = (body ?? {}) as {
    jiraAccountId?: unknown;
    jiraDisplayName?: unknown;
  };

  if (
    typeof jiraAccountId !== "string" ||
    !jiraAccountId.trim() ||
    typeof jiraDisplayName !== "string" ||
    !jiraDisplayName.trim()
  ) {
    return jsonError(400, "jiraAccountId and jiraDisplayName are required.");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError(503, "Service configuration error. Please try again later.");
  }

  try {
    const service = new SprintInviteService(supabase);
    const { token } = await service.createOrGetInvite(user.id, sprintId, jiraAccountId, jiraDisplayName);
    return new Response(JSON.stringify({ url: `${context.url.origin}/invite/${token}` }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return jsonError(500, "Could not create invite. Please try again later.");
  }
};
