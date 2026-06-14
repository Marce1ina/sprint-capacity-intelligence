import type { APIRoute } from "astro";
import { TOKEN_ENCRYPTION_KEY } from "astro:env/server";
import { accountDeletionErrorMessage } from "@/lib/account-errors";
import { revokeGoogleRefreshToken } from "@/lib/services/google-revoke";
import { IntegrationTokenService } from "@/lib/services/integration-token-service";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return context.redirect(
      `/auth/signin?error=${encodeURIComponent(accountDeletionErrorMessage("not_authenticated"))}`,
    );
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return context.redirect(`/settings?error=${encodeURIComponent(accountDeletionErrorMessage("config_error"))}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/settings?error=${encodeURIComponent(accountDeletionErrorMessage("config_error"))}`);
  }

  try {
    const tokenService = new IntegrationTokenService(supabase, TOKEN_ENCRYPTION_KEY ?? "");

    let refreshToken: string | undefined;
    try {
      const googleTokens = await tokenService.getGoogleCalendarTokens(user.id);
      refreshToken = googleTokens?.refreshToken;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      // eslint-disable-next-line no-console -- best-effort revoke; log without token data
      console.error("Google token read failed during account deletion:", message);
    }

    if (refreshToken) {
      await revokeGoogleRefreshToken(refreshToken);
    }

    await tokenService.deleteAllTokens(user.id);

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return context.redirect(`/settings?error=${encodeURIComponent(accountDeletionErrorMessage("delete_failed"))}`);
    }

    try {
      await supabase.auth.signOut();
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      // eslint-disable-next-line no-console -- user already deleted; sign-out is best-effort
      console.error("Sign-out failed after account deletion:", message);
    }

    return context.redirect("/");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    // eslint-disable-next-line no-console -- ops visibility; log without token data
    console.error("Account deletion failed:", message);
    return context.redirect(`/settings?error=${encodeURIComponent(accountDeletionErrorMessage("delete_failed"))}`);
  }
};
