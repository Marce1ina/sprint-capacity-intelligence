import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SECRET_PROBE } from "@/test/fixtures";
import { createMockApiContext } from "@/test/mock-api-context";
import { assertNoSecretProbe } from "@/test/secret-scan";

const mockExchangeCodeForSession = vi.fn();
const mockCreateClient = vi.fn(
  (): {
    auth: { exchangeCodeForSession: typeof mockExchangeCodeForSession };
  } | null => ({
    auth: { exchangeCodeForSession: mockExchangeCodeForSession },
  }),
);

vi.mock("@/lib/supabase", () => ({
  createClient: (): ReturnType<typeof mockCreateClient> => mockCreateClient(),
}));

import { GET as getAuthCallback } from "@/pages/api/auth/callback";

function getRedirectLocation(response: Response): string {
  return response.headers.get("Location") ?? "";
}

describe("GET /api/auth/callback — OAuth contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockReturnValue({
      auth: { exchangeCodeForSession: mockExchangeCodeForSession },
    });
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects to sign-in with error when code is missing", async () => {
    const context = createMockApiContext({
      url: "http://localhost/api/auth/callback",
    });

    const response = await getAuthCallback(context);
    expect(response.status).toBe(302);

    const location = getRedirectLocation(response);
    expect(location).toContain("/auth/signin");
    expect(location).toContain(encodeURIComponent("Missing authorization code"));
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("redirects to sign-in when Supabase is not configured", async () => {
    mockCreateClient.mockReturnValue(null);

    const context = createMockApiContext({
      url: "http://localhost/api/auth/callback?code=test-auth-code",
    });

    const response = await getAuthCallback(context);
    expect(response.status).toBe(302);

    const location = getRedirectLocation(response);
    expect(location).toContain("/auth/signin");
    expect(location).toContain(encodeURIComponent("Supabase is not configured"));
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("redirects to sign-in with mapped message on exchangeCodeForSession error", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: { message: `oauth failed: ${SECRET_PROBE}`, code: "unknown_error" },
    });

    const context = createMockApiContext({
      url: "http://localhost/api/auth/callback?code=test-auth-code",
    });

    const response = await getAuthCallback(context);
    expect(response.status).toBe(302);

    const location = getRedirectLocation(response);
    expect(location).toContain("/auth/signin");
    expect(location).toContain(encodeURIComponent("Could not sign in. Please try again."));
    assertNoSecretProbe(location, SECRET_PROBE);
  });

  it("redirects to sign-in with whitelisted message for known OAuth error codes", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: { message: `detail ${SECRET_PROBE}`, code: "invalid_grant" },
    });

    const context = createMockApiContext({
      url: "http://localhost/api/auth/callback?code=test-auth-code",
    });

    const response = await getAuthCallback(context);
    const location = getRedirectLocation(response);
    expect(location).toContain(encodeURIComponent("Sign-in session expired. Please try again."));
    assertNoSecretProbe(location, SECRET_PROBE);
  });

  it("redirects to /onboarding on successful code exchange", async () => {
    const context = createMockApiContext({
      url: "http://localhost/api/auth/callback?code=test-auth-code",
    });

    const response = await getAuthCallback(context);
    expect(response.status).toBe(302);
    expect(getRedirectLocation(response)).toContain("/onboarding");
    expect(getRedirectLocation(response)).not.toContain("/dashboard");
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("test-auth-code");
  });
});
