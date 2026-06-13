export type IntegrationProvider = "jira" | "google_calendar";

export interface JiraTokenPayload {
  pat: string;
  siteUrl?: string;
}

export interface GoogleCalendarTokenPayload {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes: string[];
}

export interface IntegrationTokenRow {
  id: string;
  user_id: string;
  provider: IntegrationProvider;
  encrypted_payload: string;
  created_at: string;
  updated_at: string;
}
