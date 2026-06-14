import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptTokenPayload, encryptTokenPayload, TokenEncryptionError } from "@/lib/crypto/token-encryption";
import type { GoogleCalendarTokenPayload, IntegrationProvider, JiraTokenPayload } from "@/types";

export { TokenEncryptionError };

export class IntegrationTokenService {
  constructor(
    private supabase: SupabaseClient,
    private encryptionKey: string,
  ) {}

  private requireEncryptionKey(): string {
    if (!this.encryptionKey) {
      throw new TokenEncryptionError("TOKEN_ENCRYPTION_KEY is not configured");
    }
    return this.encryptionKey;
  }

  private async upsertPayload(
    userId: string,
    provider: IntegrationProvider,
    payload: JiraTokenPayload | GoogleCalendarTokenPayload,
  ): Promise<void> {
    const encryptedPayload = await encryptTokenPayload(JSON.stringify(payload), this.requireEncryptionKey());

    const { error } = await this.supabase.from("integration_tokens").upsert(
      {
        user_id: userId,
        provider,
        encrypted_payload: encryptedPayload,
      },
      { onConflict: "user_id,provider" },
    );

    if (error) {
      throw error;
    }
  }

  private assertJiraPayload(payload: unknown): JiraTokenPayload {
    if (typeof payload !== "object" || payload === null) {
      throw new TokenEncryptionError("Stored token payload is invalid");
    }

    const { pat, siteUrl } = payload as Record<string, unknown>;
    if (typeof pat !== "string") {
      throw new TokenEncryptionError("Stored token payload is invalid");
    }
    if (siteUrl !== undefined && typeof siteUrl !== "string") {
      throw new TokenEncryptionError("Stored token payload is invalid");
    }

    return siteUrl !== undefined ? { pat, siteUrl } : { pat };
  }

  private assertGoogleCalendarPayload(payload: unknown): GoogleCalendarTokenPayload {
    if (typeof payload !== "object" || payload === null) {
      throw new TokenEncryptionError("Stored token payload is invalid");
    }

    const { accessToken, refreshToken, expiresAt, scopes } = payload as Record<string, unknown>;
    if (
      typeof accessToken !== "string" ||
      typeof refreshToken !== "string" ||
      typeof expiresAt !== "string" ||
      !Array.isArray(scopes) ||
      !scopes.every((scope) => typeof scope === "string")
    ) {
      throw new TokenEncryptionError("Stored token payload is invalid");
    }

    return { accessToken, refreshToken, expiresAt, scopes };
  }

  private async getDecryptedPayload(userId: string, provider: IntegrationProvider): Promise<unknown> {
    const { data, error } = await this.supabase
      .from("integration_tokens")
      .select("encrypted_payload")
      .eq("user_id", userId)
      .eq("provider", provider)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data || typeof data.encrypted_payload !== "string") {
      return null;
    }

    return await decryptTokenPayload(data.encrypted_payload, this.requireEncryptionKey());
  }

  async upsertJiraPat(userId: string, payload: JiraTokenPayload): Promise<void> {
    await this.upsertPayload(userId, "jira", payload);
  }

  async upsertGoogleCalendarTokens(userId: string, payload: GoogleCalendarTokenPayload): Promise<void> {
    await this.upsertPayload(userId, "google_calendar", payload);
  }

  async getJiraPat(userId: string): Promise<JiraTokenPayload | null> {
    const payload = await this.getDecryptedPayload(userId, "jira");
    if (payload === null) {
      return null;
    }
    return this.assertJiraPayload(payload);
  }

  async getGoogleCalendarTokens(userId: string): Promise<GoogleCalendarTokenPayload | null> {
    const payload = await this.getDecryptedPayload(userId, "google_calendar");
    if (payload === null) {
      return null;
    }
    return this.assertGoogleCalendarPayload(payload);
  }

  async deleteToken(userId: string, provider: IntegrationProvider): Promise<void> {
    const { error } = await this.supabase
      .from("integration_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("provider", provider);

    if (error) {
      throw error;
    }
  }

  async deleteAllTokens(userId: string): Promise<void> {
    const { error } = await this.supabase.from("integration_tokens").delete().eq("user_id", userId);

    if (error) {
      throw error;
    }
  }

  async hasToken(userId: string, provider: IntegrationProvider): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("integration_tokens")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", provider)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data !== null;
  }
}
