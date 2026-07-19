import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SECRET_PROBE, TEST_JIRA_SITE } from "@/test/fixtures";
import {
  integrationTokenServiceMockModule,
  mockDeleteAllTokens,
  mockGetGoogleCalendarTokens,
  mockUpsertJiraPat,
} from "@/test/mock-integration-token-service";
import { mockAstroEnvServerWithServiceRole } from "@/test/mock-server-deps";
import { createMockApiContext, createMockUser } from "@/test/mock-api-context";

const mockSignOut = vi.fn((): Promise<void> => Promise.resolve());
const mockCreateClient = vi.fn((): { auth: { signOut: typeof mockSignOut } } => ({
  auth: { signOut: mockSignOut },
}));
const mockValidateJiraCredentials = vi.fn((): Promise<void> => Promise.resolve());
const mockDeleteUser = vi.fn((_id: string): Promise<{ error: null }> => Promise.resolve({ error: null }));
const mockRevokeGoogleRefreshToken = vi.fn((_token: string): Promise<void> => Promise.resolve());

vi.mock("astro:env/server", () => mockAstroEnvServerWithServiceRole);

vi.mock("@/lib/supabase", () => ({
  createClient: (): { auth: { signOut: typeof mockSignOut } } => mockCreateClient(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  createAdminClient: (): {
    auth: { admin: { deleteUser: (id: string) => Promise<{ error: null }> } };
  } => ({
    auth: {
      admin: {
        deleteUser: (id: string) => mockDeleteUser(id),
      },
    },
  }),
}));

vi.mock("@/lib/services/jira-client", () => ({
  validateJiraCredentials: (): Promise<void> => mockValidateJiraCredentials(),
}));

vi.mock("@/lib/services/google-revoke", () => ({
  revokeGoogleRefreshToken: (token: string): Promise<void> => mockRevokeGoogleRefreshToken(token),
}));

vi.mock("@/lib/services/integration-token-service", () => integrationTokenServiceMockModule());

import { POST as postOnboardingJira } from "@/pages/api/onboarding/jira";
import { POST as postAccountDelete } from "@/pages/api/account/delete";

describe("redirect routes — secret scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateJiraCredentials.mockResolvedValue(undefined);
    mockUpsertJiraPat.mockResolvedValue(undefined);
    mockDeleteUser.mockResolvedValue({ error: null });
    mockSignOut.mockResolvedValue(undefined);
    mockDeleteAllTokens.mockResolvedValue(undefined);
    mockRevokeGoogleRefreshToken.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POST /api/onboarding/jira redirect Location does not contain probe PAT", async () => {
    const context = createMockApiContext({
      user: createMockUser(),
      url: "http://localhost/api/onboarding/jira",
      method: "POST",
    });

    const body = new URLSearchParams({
      pat: SECRET_PROBE,
      siteUrl: TEST_JIRA_SITE,
    });
    context.request = new Request(context.url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const response = await postOnboardingJira(context);
    expect(response.status).toBe(302);

    const location = response.headers.get("Location") ?? "";
    expect(location).not.toContain(SECRET_PROBE);
    expect(new URL(location, "http://localhost").pathname).toBe("/");
  });

  it("POST /api/account/delete logs no probe refresh token when Google token read fails", async () => {
    mockGetGoogleCalendarTokens.mockRejectedValue(new Error(`decryption failed: ${SECRET_PROBE}`));

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const context = createMockApiContext({
      user: createMockUser(),
      url: "http://localhost/api/account/delete",
      method: "POST",
    });

    const response = await postAccountDelete(context);
    expect(response.status).toBe(302);
    expect(mockGetGoogleCalendarTokens).toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();

    const logged = consoleError.mock.calls.flat().join(" ");
    expect(logged).not.toContain(SECRET_PROBE);
  });
});
