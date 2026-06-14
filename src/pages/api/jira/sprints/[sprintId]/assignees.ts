import type { APIRoute } from "astro";
import { jsonError, mapJiraClientError, resolveJiraApiContext } from "@/lib/jira-api-context";
import { parsePositiveInt } from "@/lib/parse-route-id";
import { getSprintAssignees } from "@/lib/services/jira-client";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const sprintId = parsePositiveInt(context.params.sprintId);
  if (sprintId === null) {
    return jsonError(400, "Invalid sprint ID.");
  }

  const resolved = await resolveJiraApiContext(context);
  if (resolved instanceof Response) {
    return resolved;
  }

  try {
    const assignees = await getSprintAssignees(resolved.siteUrl, resolved.pat, resolved.email, sprintId);
    return new Response(JSON.stringify({ assignees, sprintId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return mapJiraClientError(error, "Could not load sprint assignees from Jira. Please try again.");
  }
};
