import type { APIContext } from "astro";
import { TOKEN_ENCRYPTION_KEY } from "astro:env/server";
import type { User } from "@supabase/supabase-js";
import { assertAllowedJiraSiteUrl } from "@/lib/jira-site-url";
import { createClient } from "@/lib/supabase";
import { IntegrationTokenService } from "@/lib/services/integration-token-service";
import { JiraValidationError } from "@/types";

export interface JiraApiContext {
  user: User;
  pat: string;
  siteUrl: string;
  email: string;
}

export function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function resolveJiraApiContext(context: APIContext): Promise<JiraApiContext | Response> {
  const user = context.locals.user;
  if (!user) {
    return jsonError(401, "Authentication required.");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError(503, "Service configuration error. Please try again later.");
  }

  if (!TOKEN_ENCRYPTION_KEY) {
    return jsonError(503, "Service configuration error. Please try again later.");
  }

  let jiraToken;
  try {
    const service = new IntegrationTokenService(supabase, TOKEN_ENCRYPTION_KEY);
    jiraToken = await service.getJiraPat(user.id);
  } catch {
    return jsonError(503, "Could not load Jira credentials. Please try again later.");
  }

  if (!jiraToken) {
    return jsonError(403, "Jira is not configured. Complete onboarding first.");
  }

  if (!jiraToken.siteUrl) {
    return jsonError(400, "Jira site URL is missing. Reconnect Jira in onboarding.");
  }

  try {
    const siteUrl = assertAllowedJiraSiteUrl(jiraToken.siteUrl);
    const email = user.email ?? "";
    if (!email.trim()) {
      return jsonError(400, "Your account email is required to access Jira.");
    }

    return {
      user,
      pat: jiraToken.pat,
      siteUrl,
      email,
    };
  } catch (error) {
    if (error instanceof JiraValidationError) {
      return jsonError(400, error.userMessage);
    }
    return jsonError(400, "Invalid Jira site URL. Reconnect Jira in onboarding.");
  }
}

export function mapJiraClientError(error: unknown, fallbackMessage: string): Response {
  if (error instanceof JiraValidationError) {
    return jsonError(400, error.userMessage);
  }
  return jsonError(500, fallbackMessage);
}
