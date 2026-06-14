/**
 * Local smoke test for integration token encryption and persistence.
 *
 * Prerequisites:
 * - Docker running with local Supabase: `npx supabase start` then `npx supabase db reset`
 * - `.env` with SUPABASE_URL, SUPABASE_KEY, TOKEN_ENCRYPTION_KEY
 *
 * Test users (create in Supabase Studio or let this script sign them up via the Auth API):
 * - TEST_USER_EMAIL / TEST_USER_PASSWORD (required)
 * - TEST_USER_B_EMAIL / TEST_USER_B_PASSWORD (optional, for RLS isolation check)
 *
 * Run:
 *   npx tsx --env-file=.env scripts/verify-integration-tokens.mts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decryptTokenPayload, encryptTokenPayload } from "../src/lib/crypto/token-encryption.ts";
import { IntegrationTokenService, TokenEncryptionError } from "../src/lib/services/integration-token-service.ts";
import type { GoogleCalendarTokenPayload, JiraTokenPayload } from "../src/types.ts";

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_KEY", "TOKEN_ENCRYPTION_KEY"] as const;

const jiraSample: JiraTokenPayload = {
  pat: "verify-script-jira-pat",
  siteUrl: "https://example.atlassian.net",
};

const calendarSample: GoogleCalendarTokenPayload = {
  accessToken: "verify-script-access-token",
  refreshToken: "verify-script-refresh-token",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
};

interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: CheckResult[] = [];

function record(name: string, passed: boolean, detail?: string): void {
  results.push({ name, passed, detail });
  const status = passed ? "PASS" : "FAIL";
  console.log(`[${status}] ${name}${detail ? `: ${detail}` : ""}`);
}

function requireEnv(): { supabaseUrl: string; supabaseKey: string; encryptionKey: string } {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  return {
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseKey: process.env.SUPABASE_KEY ?? "",
    encryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? "",
  };
}

async function signInOrSignUp(supabase: SupabaseClient, email: string, password: string): Promise<string> {
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

async function runCryptoRoundTrip(encryptionKey: string): Promise<void> {
  const jiraPlain = JSON.stringify(jiraSample);
  const jiraEncrypted = await encryptTokenPayload(jiraPlain, encryptionKey);
  const jiraDecrypted = await decryptTokenPayload(jiraEncrypted, encryptionKey);
  record("crypto jira round-trip", JSON.stringify(jiraDecrypted) === jiraPlain);

  const calendarPlain = JSON.stringify(calendarSample);
  const calendarEncrypted = await encryptTokenPayload(calendarPlain, encryptionKey);
  const calendarDecrypted = await decryptTokenPayload(calendarEncrypted, encryptionKey);
  record("crypto calendar round-trip", JSON.stringify(calendarDecrypted) === calendarPlain);
}

async function runMissingKeyCheck(supabase: SupabaseClient): Promise<void> {
  const service = new IntegrationTokenService(supabase, "");
  let threw = false;
  try {
    await service.upsertJiraPat("00000000-0000-0000-0000-000000000001", jiraSample);
  } catch (error) {
    threw = error instanceof TokenEncryptionError;
  }
  record("service rejects missing encryption key", threw);
}

async function runServiceFlow(supabase: SupabaseClient, userId: string, encryptionKey: string): Promise<void> {
  const service = new IntegrationTokenService(supabase, encryptionKey);

  await service.upsertJiraPat(userId, jiraSample);
  record("jira upsert", await service.hasToken(userId, "jira"));

  const jiraRead = await service.getJiraPat(userId);
  record("jira get round-trip", jiraRead?.pat === jiraSample.pat && jiraRead.siteUrl === jiraSample.siteUrl);

  await service.upsertGoogleCalendarTokens(userId, calendarSample);
  record("calendar upsert", await service.hasToken(userId, "google_calendar"));

  const calendarRead = await service.getGoogleCalendarTokens(userId);
  record(
    "calendar get round-trip",
    calendarRead?.accessToken === calendarSample.accessToken &&
      calendarRead.refreshToken === calendarSample.refreshToken,
  );

  await service.deleteToken(userId, "jira");
  record("jira delete", !(await service.hasToken(userId, "jira")));

  await service.deleteToken(userId, "google_calendar");
  record("calendar delete", !(await service.hasToken(userId, "google_calendar")));
}

async function runRlsIsolation(
  supabaseUrl: string,
  supabaseKey: string,
  encryptionKey: string,
  emailA: string,
  passwordA: string,
  emailB: string,
  passwordB: string,
): Promise<void> {
  const clientA = createClient(supabaseUrl, supabaseKey);
  const userAId = await signInOrSignUp(clientA, emailA, passwordA);

  const serviceA = new IntegrationTokenService(clientA, encryptionKey);
  await serviceA.upsertJiraPat(userAId, jiraSample);

  const clientB = createClient(supabaseUrl, supabaseKey);
  const userBId = await signInOrSignUp(clientB, emailB, passwordB);

  const serviceB = new IntegrationTokenService(clientB, encryptionKey);
  const crossRead = await serviceB.getJiraPat(userAId);

  record("RLS blocks cross-user read", crossRead === null);

  await serviceA.deleteToken(userAId, "jira");
  void userBId;
}

async function main(): Promise<void> {
  const { supabaseUrl, supabaseKey, encryptionKey } = requireEnv();
  record("required env vars present", true);

  await runCryptoRoundTrip(encryptionKey);

  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    record("service flow (skipped)", true, "set TEST_USER_EMAIL and TEST_USER_PASSWORD to run");
  } else {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const userId = await signInOrSignUp(supabase, email, password);
    await runMissingKeyCheck(supabase);
    await runServiceFlow(supabase, userId, encryptionKey);

    const emailB = process.env.TEST_USER_B_EMAIL;
    const passwordB = process.env.TEST_USER_B_PASSWORD;
    if (emailB && passwordB) {
      await runRlsIsolation(supabaseUrl, supabaseKey, encryptionKey, email, password, emailB, passwordB);
    } else {
      record("RLS isolation (skipped)", true, "set TEST_USER_B_* env vars to run");
    }
  }

  const failed = results.filter((r) => !r.passed);
  console.log("");
  console.log(`Summary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Verification script failed: ${message}`);
  process.exit(1);
});
