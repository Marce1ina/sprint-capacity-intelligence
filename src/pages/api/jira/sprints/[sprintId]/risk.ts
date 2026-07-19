import type { APIRoute } from "astro";
import { TOKEN_ENCRYPTION_KEY } from "astro:env/server";
import { jsonError, mapJiraClientError, resolveJiraApiContext } from "@/lib/jira-api-context";
import { parsePositiveInt } from "@/lib/parse-route-id";
import { computeSprintRisk } from "@/lib/services/risk-computation-service";
import { createClient } from "@/lib/supabase";
import { createAdminClient } from "@/lib/supabase-admin";

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

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError(503, "Service configuration error. Please try again later.");
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return jsonError(503, "Service configuration error. Please try again later.");
  }

  if (!TOKEN_ENCRYPTION_KEY) {
    return jsonError(503, "Service configuration error. Please try again later.");
  }

  try {
    const rows = await computeSprintRisk({
      siteUrl: resolved.siteUrl,
      pat: resolved.pat,
      accountEmail: resolved.email,
      sprintId,
      supabase,
      adminClient,
      encryptionKey: TOKEN_ENCRYPTION_KEY,
    });
    return new Response(JSON.stringify({ sprintId, rows }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return mapJiraClientError(error, "Could not compute sprint risk. Please try again.");
  }
};
