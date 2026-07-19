import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockApiContext } from "@/test/mock-api-context";
import { inviteApiContextMockModule, mockResolveInviteAdminService } from "@/test/mock-invite-api-context";

const mockSignInWithOAuth = vi.fn();
const mockCreateClient = vi.fn((): { auth: { signInWithOAuth: typeof mockSignInWithOAuth } } | null => ({
  auth: { signInWithOAuth: mockSignInWithOAuth },
}));

vi.mock("@/lib/supabase", () => ({
  createClient: (): ReturnType<typeof mockCreateClient> => mockCreateClient(),
}));
vi.mock("@/lib/invite-api-context", () => inviteApiContextMockModule());

import { GET } from "@/pages/api/invite/[token]/start";

function getRedirectLocation(response: Response): string {
  return response.headers.get("Location") ?? "";
}

describe("GET /api/invite/[token]/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockReturnValue({ auth: { signInWithOAuth: mockSignInWithOAuth } });
  });

  it("redirects to Google's consent screen for a pending invite", async () => {
    mockResolveInviteAdminService.mockReturnValue({
      getInviteByToken: vi.fn().mockResolvedValue({ status: "pending" }),
    });
    mockSignInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.com/o/oauth2/auth" }, error: null });

    const context = createMockApiContext({ url: "http://localhost/api/invite/test-token/start" });
    context.params = { token: "test-token" };

    const response = await GET(context);
    expect(response.status).toBe(302);
    expect(getRedirectLocation(response)).toBe("https://accounts.google.com/o/oauth2/auth");

    expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1);
    const callArgs = mockSignInWithOAuth.mock.calls[0]?.[0] as {
      provider: string;
      options: { scopes: string; redirectTo: string };
    };
    expect(callArgs.provider).toBe("google");
    expect(callArgs.options.scopes).toBe("https://www.googleapis.com/auth/calendar.readonly");
    expect(callArgs.options.redirectTo).toBe("http://localhost/api/invite/test-token/callback");
  });

  it("redirects back to the landing page for an already-consumed invite", async () => {
    mockResolveInviteAdminService.mockReturnValue({
      getInviteByToken: vi.fn().mockResolvedValue({ status: "consumed" }),
    });

    const context = createMockApiContext({ url: "http://localhost/api/invite/test-token/start" });
    context.params = { token: "test-token" };

    const response = await GET(context);
    expect(response.status).toBe(302);
    expect(getRedirectLocation(response)).toBe("http://localhost/invite/test-token");
    expect(mockSignInWithOAuth).not.toHaveBeenCalled();
  });

  it("redirects back to the landing page for an invalid token", async () => {
    mockResolveInviteAdminService.mockReturnValue({
      getInviteByToken: vi.fn().mockResolvedValue(null),
    });

    const context = createMockApiContext({ url: "http://localhost/api/invite/nonexistent/start" });
    context.params = { token: "nonexistent" };

    const response = await GET(context);
    expect(response.status).toBe(302);
    expect(getRedirectLocation(response)).toBe("http://localhost/invite/nonexistent");
    expect(mockSignInWithOAuth).not.toHaveBeenCalled();
  });
});
