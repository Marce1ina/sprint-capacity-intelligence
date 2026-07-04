import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IntegrationTokenService } from "@/lib/services/integration-token-service";
import {
  createSessionClient,
  isRlsSuiteEnabled,
  requireEncryptionKey,
  requireRlsTestCredentials,
  RLS_JIRA_SAMPLE,
  signInOrSignUp,
} from "@/test/rls-fixtures";

const rlsDescribe = describe.skipIf(!isRlsSuiteEnabled());

function expectRlsDenial(error: unknown): void {
  expect(error).toBeTruthy();
  const message = error instanceof Error ? error.message : String(error);
  let code = "";
  if (typeof error === "object" && error !== null && "code" in error) {
    code = String(error.code);
  }

  expect(code === "42501" || /row-level security|permission denied|violates row-level security/i.test(message)).toBe(
    true,
  );
}

rlsDescribe("IntegrationTokenService RLS isolation (two-user)", { concurrent: false }, () => {
  let encryptionKey: string;
  let userAId: string;
  let credentials: ReturnType<typeof requireRlsTestCredentials>;
  let seededToken = false;

  beforeAll(async () => {
    encryptionKey = requireEncryptionKey();
    credentials = requireRlsTestCredentials();

    const clientA = createSessionClient();
    userAId = await signInOrSignUp(clientA, credentials.emailA, credentials.passwordA);

    const clientB = createSessionClient();
    await signInOrSignUp(clientB, credentials.emailB, credentials.passwordB);

    const serviceA = new IntegrationTokenService(clientA, encryptionKey);
    await serviceA.upsertJiraPat(userAId, RLS_JIRA_SAMPLE);
    seededToken = true;
  });

  afterAll(async () => {
    if (!seededToken) {
      return;
    }

    try {
      const clientA = createSessionClient();
      await signInOrSignUp(clientA, credentials.emailA, credentials.passwordA);
      const serviceA = new IntegrationTokenService(clientA, encryptionKey);
      await serviceA.deleteToken(userAId, "jira");
    } catch {
      // Best-effort cleanup; manual reset remains available via supabase db reset.
    }
  });

  it("blocks User B from reading User A's Jira token", async () => {
    const clientB = createSessionClient();
    await signInOrSignUp(clientB, credentials.emailB, credentials.passwordB);

    const serviceB = new IntegrationTokenService(clientB, encryptionKey);
    const crossRead = await serviceB.getJiraPat(userAId);

    expect(crossRead).toBeNull();
  });

  it("blocks User B from upserting into User A's token row", async () => {
    const clientB = createSessionClient();
    await signInOrSignUp(clientB, credentials.emailB, credentials.passwordB);

    const serviceB = new IntegrationTokenService(clientB, encryptionKey);
    const attackerPayload = {
      pat: "attacker-overwrite-pat",
      siteUrl: "https://attacker.atlassian.net",
    };

    try {
      await serviceB.upsertJiraPat(userAId, attackerPayload);
      expect.fail("expected RLS to block cross-user upsert");
    } catch (error) {
      expectRlsDenial(error);
    }

    const clientA = createSessionClient();
    await signInOrSignUp(clientA, credentials.emailA, credentials.passwordA);
    const serviceA = new IntegrationTokenService(clientA, encryptionKey);
    const ownerRead = await serviceA.getJiraPat(userAId);

    expect(ownerRead?.pat).toBe(RLS_JIRA_SAMPLE.pat);
    expect(ownerRead?.siteUrl).toBe(RLS_JIRA_SAMPLE.siteUrl);
  });

  it("blocks User B deleteToken from removing User A's token", async () => {
    const clientB = createSessionClient();
    await signInOrSignUp(clientB, credentials.emailB, credentials.passwordB);

    const serviceB = new IntegrationTokenService(clientB, encryptionKey);
    await serviceB.deleteToken(userAId, "jira");

    const clientA = createSessionClient();
    await signInOrSignUp(clientA, credentials.emailA, credentials.passwordA);
    const serviceA = new IntegrationTokenService(clientA, encryptionKey);

    expect(await serviceA.hasToken(userAId, "jira")).toBe(true);
    const ownerRead = await serviceA.getJiraPat(userAId);
    expect(ownerRead?.pat).toBe(RLS_JIRA_SAMPLE.pat);
  });

  it("blocks User B deleteAllTokens from removing User A's token", async () => {
    const clientB = createSessionClient();
    await signInOrSignUp(clientB, credentials.emailB, credentials.passwordB);

    const serviceB = new IntegrationTokenService(clientB, encryptionKey);
    await serviceB.deleteAllTokens(userAId);

    const clientA = createSessionClient();
    await signInOrSignUp(clientA, credentials.emailA, credentials.passwordA);
    const serviceA = new IntegrationTokenService(clientA, encryptionKey);

    expect(await serviceA.hasToken(userAId, "jira")).toBe(true);
    const ownerRead = await serviceA.getJiraPat(userAId);
    expect(ownerRead?.pat).toBe(RLS_JIRA_SAMPLE.pat);
  });

  it("does not expose User A token to User B via hasToken", async () => {
    const clientB = createSessionClient();
    await signInOrSignUp(clientB, credentials.emailB, credentials.passwordB);

    const serviceB = new IntegrationTokenService(clientB, encryptionKey);
    expect(await serviceB.hasToken(userAId, "jira")).toBe(false);
  });
});
