import type { APIRoute } from "astro";
import { TOKEN_ENCRYPTION_KEY } from "astro:env/server";
import { authErrorUserMessage } from "@/lib/auth-errors";
import { resolveInviteAdminService } from "@/lib/invite-api-context";
import { IntegrationTokenService } from "@/lib/services/integration-token-service";
import { createClient } from "@/lib/supabase";

export const prerender = false;

/** Google doesn't expose the provider access token's own expiry — assume the standard ~1 hour TTL. */
const ASSUMED_PROVIDER_TOKEN_TTL_MS = 60 * 60 * 1000;

export const GET: APIRoute = async (context) => {
  const { token } = context.params;
  if (!token) {
    return context.redirect("/invite");
  }

  const code = context.url.searchParams.get("code");
  if (!code) {
    return context.redirect(`/invite/${token}?error=${encodeURIComponent("Missing authorization code")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/invite/${token}?error=${encodeURIComponent("Service is temporarily unavailable.")}`);
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return context.redirect(`/invite/${token}?error=${encodeURIComponent(authErrorUserMessage(error))}`);
  }

  const { session, user } = data;
  if (!session.provider_refresh_token) {
    return context.redirect(
      `/invite/${token}?error=${encodeURIComponent(
        "Calendar access wasn't granted with offline access. Please try again and accept all permissions.",
      )}`,
    );
  }

  try {
    const tokenService = new IntegrationTokenService(supabase, TOKEN_ENCRYPTION_KEY ?? "");
    await tokenService.upsertGoogleCalendarTokens(user.id, {
      accessToken: session.provider_token ?? "",
      refreshToken: session.provider_refresh_token,
      expiresAt: new Date(Date.now() + ASSUMED_PROVIDER_TOKEN_TTL_MS).toISOString(),
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });
  } catch {
    return context.redirect(`/invite/${token}?error=${encodeURIComponent("Could not save calendar access.")}`);
  }

  const adminService = resolveInviteAdminService();
  await adminService?.markConsumed(token, user.id);

  return context.redirect(`/invite/${token}?connected=1`);
};
