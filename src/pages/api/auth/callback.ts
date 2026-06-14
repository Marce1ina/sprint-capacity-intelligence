import type { APIRoute } from "astro";
import { authErrorUserMessage } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const code = context.url.searchParams.get("code");

  if (!code) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Missing authorization code")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(authErrorUserMessage(error))}`);
  }

  return context.redirect("/onboarding");
};
