import type { APIRoute } from "astro";
import { jsonError, mapJiraClientError, resolveJiraApiContext } from "@/lib/jira-api-context";
import { parsePositiveInt } from "@/lib/parse-route-id";
import { listActiveFutureSprints } from "@/lib/services/jira-client";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const boardId = parsePositiveInt(context.params.boardId);
  if (boardId === null) {
    return jsonError(400, "Invalid board ID.");
  }

  const resolved = await resolveJiraApiContext(context);
  if (resolved instanceof Response) {
    return resolved;
  }

  try {
    const sprints = await listActiveFutureSprints(resolved.siteUrl, resolved.pat, resolved.email, boardId);
    return new Response(JSON.stringify({ sprints }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return mapJiraClientError(error, "Could not load sprints from Jira. Please try again.");
  }
};
