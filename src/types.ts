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

export class JiraValidationError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super(userMessage);
    this.name = "JiraValidationError";
    this.userMessage = userMessage;
  }
}

/** Alias for read-path Jira API errors — same safe `userMessage` contract as validation. */
export { JiraValidationError as JiraApiError };

export interface JiraBoard {
  id: number;
  name: string;
  type?: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
}

export interface SprintAssignee {
  accountId: string | null;
  displayName: string;
  totalStoryPoints: number;
}
