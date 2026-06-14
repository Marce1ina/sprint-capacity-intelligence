import type { APIRoute } from "astro";
import { mapJiraClientError, resolveJiraApiContext } from "@/lib/jira-api-context";
import { listBoards } from "@/lib/services/jira-client";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const resolved = await resolveJiraApiContext(context);
  if (resolved instanceof Response) {
    return resolved;
  }

  try {
    const boards = await listBoards(resolved.siteUrl, resolved.pat, resolved.email);
    return new Response(JSON.stringify({ boards }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return mapJiraClientError(error, "Could not load boards from Jira. Please try again.");
  }
};
