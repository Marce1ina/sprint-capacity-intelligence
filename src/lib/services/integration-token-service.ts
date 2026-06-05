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

  private async getDecryptedPayload<T>(userId: string, provider: IntegrationProvider): Promise<T | null> {
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

    const plaintext = await decryptTokenPayload(data.encrypted_payload, this.requireEncryptionKey());
    return JSON.parse(plaintext) as T;
  }

  async upsertJiraPat(userId: string, payload: JiraTokenPayload): Promise<void> {
    await this.upsertPayload(userId, "jira", payload);
  }

  async upsertGoogleCalendarTokens(userId: string, payload: GoogleCalendarTokenPayload): Promise<void> {
    await this.upsertPayload(userId, "google_calendar", payload);
  }

  async getJiraPat(userId: string): Promise<JiraTokenPayload | null> {
    return this.getDecryptedPayload<JiraTokenPayload>(userId, "jira");
  }

  async getGoogleCalendarTokens(userId: string): Promise<GoogleCalendarTokenPayload | null> {
    return this.getDecryptedPayload<GoogleCalendarTokenPayload>(userId, "google_calendar");
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
