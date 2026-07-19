import type { APIRoute } from "astro";
import { authErrorUserMessage } from "@/lib/auth-errors";
import { resolveInviteAdminService } from "@/lib/invite-api-context";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const { token } = context.params;
  if (!token) {
    return context.redirect("/invite");
  }

  const adminService = resolveInviteAdminService();
  if (!adminService) {
    return context.redirect(`/invite/${token}?error=${encodeURIComponent("Service is temporarily unavailable.")}`);
  }

  const invite = await adminService.getInviteByToken(token);
  if (invite?.status !== "pending") {
    return context.redirect(`/invite/${token}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/invite/${token}?error=${encodeURIComponent("Service is temporarily unavailable.")}`);
  }

  const origin = new URL(context.request.url).origin;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes: "https://www.googleapis.com/auth/calendar.readonly",
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
      redirectTo: `${origin}/api/invite/${token}/callback`,
    },
  });

  if (error || !data.url) {
    return context.redirect(`/invite/${token}?error=${encodeURIComponent(authErrorUserMessage(error))}`);
  }

  return context.redirect(data.url);
};
