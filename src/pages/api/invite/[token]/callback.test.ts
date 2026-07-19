import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockApiContext } from "@/test/mock-api-context";
import { inviteApiContextMockModule, mockResolveInviteAdminService } from "@/test/mock-invite-api-context";
import {
  integrationTokenServiceMockModule,
  mockUpsertGoogleCalendarTokens,
} from "@/test/mock-integration-token-service";
import { mockAstroEnvServer } from "@/test/mock-server-deps";

const mockExchangeCodeForSession = vi.fn();
const mockCreateClient = vi.fn((): { auth: { exchangeCodeForSession: typeof mockExchangeCodeForSession } } | null => ({
  auth: { exchangeCodeForSession: mockExchangeCodeForSession },
}));

vi.mock("astro:env/server", () => mockAstroEnvServer);
vi.mock("@/lib/supabase", () => ({
  createClient: (): ReturnType<typeof mockCreateClient> => mockCreateClient(),
}));
vi.mock("@/lib/invite-api-context", () => inviteApiContextMockModule());
vi.mock("@/lib/services/integration-token-service", () => integrationTokenServiceMockModule());

import { GET } from "@/pages/api/invite/[token]/callback";

function getRedirectLocation(response: Response): string {
  return response.headers.get("Location") ?? "";
}

describe("GET /api/invite/[token]/callback", () => {
  const markConsumed = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockReturnValue({ auth: { exchangeCodeForSession: mockExchangeCodeForSession } });
    mockResolveInviteAdminService.mockReturnValue({ markConsumed });
    markConsumed.mockResolvedValue(true);
  });

  it("stores calendar tokens and redirects to the connected success state", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: {
        user: { id: "assignee-user-id" },
        session: { provider_token: "google-access-token", provider_refresh_token: "google-refresh-token" },
      },
      error: null,
    });

    const context = createMockApiContext({ url: "http://localhost/api/invite/test-token/callback?code=auth-code" });
    context.params = { token: "test-token" };

    const response = await GET(context);
    expect(response.status).toBe(302);
    expect(getRedirectLocation(response)).toBe("http://localhost/invite/test-token?connected=1");
    expect(mockUpsertGoogleCalendarTokens).toHaveBeenCalledWith(
      "assignee-user-id",
      expect.objectContaining({ accessToken: "google-access-token", refreshToken: "google-refresh-token" }),
    );
    expect(markConsumed).toHaveBeenCalledWith("test-token", "assignee-user-id");
  });

  it("redirects with an error when the code exchange fails", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: null, error: { message: "invalid code" } });

    const context = createMockApiContext({ url: "http://localhost/api/invite/test-token/callback?code=bad-code" });
    context.params = { token: "test-token" };

    const response = await GET(context);
    expect(response.status).toBe(302);
    expect(getRedirectLocation(response)).toContain("/invite/test-token?error=");
    expect(mockUpsertGoogleCalendarTokens).not.toHaveBeenCalled();
  });

  it("redirects with an error when Google doesn't return a refresh token", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: {
        user: { id: "assignee-user-id" },
        session: { provider_token: "google-access-token" },
      },
      error: null,
    });

    const context = createMockApiContext({ url: "http://localhost/api/invite/test-token/callback?code=auth-code" });
    context.params = { token: "test-token" };

    const response = await GET(context);
    expect(response.status).toBe(302);
    expect(getRedirectLocation(response)).toContain("/invite/test-token?error=");
    expect(mockUpsertGoogleCalendarTokens).not.toHaveBeenCalled();
    expect(markConsumed).not.toHaveBeenCalled();
  });
});
