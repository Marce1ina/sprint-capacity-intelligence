import type { APIRoute } from "astro";
import { TOKEN_ENCRYPTION_KEY } from "astro:env/server";
import { createClient } from "@/lib/supabase";
import { IntegrationTokenService } from "@/lib/services/integration-token-service";
import { assertAllowedJiraSiteUrl } from "@/lib/jira-site-url";
import { validateJiraCredentials } from "@/lib/services/jira-client";
import { JiraValidationError } from "@/types";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin?error=Please+sign+in+to+continue");
  }

  const form = await context.request.formData();
  const pat = (form.get("pat") as string | null)?.trim() ?? "";
  const siteUrl = (form.get("siteUrl") as string | null)?.trim() ?? "";

  if (!pat || !siteUrl) {
    return context.redirect("/onboarding?error=Jira+token+and+site+URL+are+required");
  }

  try {
    await validateJiraCredentials(siteUrl, pat, user.email ?? "");
  } catch (error) {
    if (error instanceof JiraValidationError) {
      return context.redirect(`/onboarding?error=${encodeURIComponent(error.userMessage)}`);
    }
    return context.redirect("/onboarding?error=Could+not+validate+Jira+credentials.+Please+try+again.");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/onboarding?error=Service+configuration+error.+Please+try+again+later.");
  }

  try {
    const service = new IntegrationTokenService(supabase, TOKEN_ENCRYPTION_KEY ?? "");
    await service.upsertJiraPat(user.id, { pat, siteUrl: assertAllowedJiraSiteUrl(siteUrl) });
  } catch {
    return context.redirect("/onboarding?error=Could+not+save+Jira+credentials.+Please+try+again.");
  }

  return context.redirect("/dashboard");
};
