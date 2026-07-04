import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { JiraTokenPayload } from "@/types";

export const RLS_JIRA_SAMPLE: JiraTokenPayload = {
  pat: "rls-test-jira-pat",
  siteUrl: "https://rls-test.atlassian.net",
};

export function isLocalSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}

export function isRlsSuiteEnabled(): boolean {
  const supabaseUrl = process.env.SUPABASE_URL;
  return Boolean(
    supabaseUrl &&
    isLocalSupabaseUrl(supabaseUrl) &&
    process.env.SUPABASE_KEY &&
    process.env.TOKEN_ENCRYPTION_KEY &&
    process.env.TEST_USER_EMAIL &&
    process.env.TEST_USER_PASSWORD &&
    process.env.TEST_USER_B_EMAIL &&
    process.env.TEST_USER_B_PASSWORD,
  );
}

export interface RlsTestCredentials {
  emailA: string;
  passwordA: string;
  emailB: string;
  passwordB: string;
}

export function requireRlsTestCredentials(): RlsTestCredentials {
  const emailA = process.env.TEST_USER_EMAIL;
  const passwordA = process.env.TEST_USER_PASSWORD;
  const emailB = process.env.TEST_USER_B_EMAIL;
  const passwordB = process.env.TEST_USER_B_PASSWORD;

  if (!emailA || !passwordA || !emailB || !passwordB) {
    throw new Error("TEST_USER_* and TEST_USER_B_* env vars are required for RLS tests");
  }

  if (emailA === emailB) {
    throw new Error("TEST_USER_EMAIL and TEST_USER_B_EMAIL must be distinct accounts for RLS isolation tests");
  }

  return { emailA, passwordA, emailB, passwordB };
}

export async function signInOrSignUp(supabase: SupabaseClient, email: string, password: string): Promise<string> {
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (!signIn.error) {
    return signIn.data.user.id;
  }

  const signUp = await supabase.auth.signUp({ email, password });
  if (signUp.error || !signUp.data.user) {
    throw new Error(`Could not authenticate ${email}: ${signUp.error?.message ?? signIn.error.message}`);
  }

  return signUp.data.user.id;
}

export function createSessionClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_KEY are required for RLS tests");
  }

  return createClient(supabaseUrl, supabaseKey) as SupabaseClient;
}

export function requireEncryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required for RLS tests");
  }
  return key;
}
