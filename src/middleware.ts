import { defineMiddleware } from "astro:middleware";
import { TOKEN_ENCRYPTION_KEY } from "astro:env/server";
import { createClient } from "@/lib/supabase";
import { IntegrationTokenService } from "@/lib/services/integration-token-service";

const PROTECTED_ROUTES = ["/dashboard", "/onboarding", "/settings"];

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = context.url.pathname;
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (!context.locals.user) {
    if (isProtectedPage(pathname)) {
      return context.redirect("/auth/signin");
    }
    return next();
  }

  if (isProtectedPage(pathname) && supabase && !pathname.startsWith("/settings")) {
    try {
      const service = new IntegrationTokenService(supabase, TOKEN_ENCRYPTION_KEY ?? "");
      const hasJiraToken = await service.hasToken(context.locals.user.id, "jira");

      if (pathname.startsWith("/dashboard") && !hasJiraToken) {
        return context.redirect("/onboarding");
      }

      if (pathname.startsWith("/onboarding") && hasJiraToken) {
        return context.redirect("/dashboard");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      // eslint-disable-next-line no-console -- fail-open guard; log PostgREST errors without token data
      console.error("Jira token check failed:", message);
    }
  }

  return next();
});
