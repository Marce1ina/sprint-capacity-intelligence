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
  userId: string;
  provider: IntegrationProvider;
  encryptedPayload: string;
  createdAt: string;
  updatedAt: string;
}
