import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";
import { integrationTokenServiceMockModule, mockHasToken } from "@/test/mock-integration-token-service";
import { mockAstroEnvServer } from "@/test/mock-server-deps";
import { createMockApiContext, createMockUser } from "@/test/mock-api-context";

const mockGetUser = vi.fn();

vi.mock("astro:env/server", () => mockAstroEnvServer);

vi.mock("@/lib/supabase", () => ({
  createClient: (): { auth: { getUser: typeof mockGetUser } } => ({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock("@/lib/services/integration-token-service", () => integrationTokenServiceMockModule());

import { onRequest } from "@/middleware";

type MiddlewareNext = () => Response | Promise<Response>;
type MiddlewareFn = (context: APIContext, next: MiddlewareNext) => Response | Promise<Response>;

const middleware = onRequest as unknown as MiddlewareFn;

async function invokeMiddleware(context: APIContext, next: MiddlewareNext): Promise<Response> {
  return await middleware(context, next);
}

function assertRedirect(response: Response, expectedPath: string): void {
  expect(response.status).toBe(302);
  const location = response.headers.get("Location") ?? "";
  expect(location).toContain(expectedPath);
}

describe("middleware — auth gate redirect matrix", () => {
  const next = vi.fn((): Response => new Response("ok", { status: 200 }));

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    mockHasToken.mockResolvedValue(false);
    next.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects unauthenticated GET /dashboard to sign-in", async () => {
    const context = createMockApiContext({
      user: null,
      url: "http://localhost/dashboard",
    });

    const response = await invokeMiddleware(context, next);
    assertRedirect(response, "/auth/signin");
    expect(next).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated GET /settings to sign-in", async () => {
    const context = createMockApiContext({
      user: null,
      url: "http://localhost/settings",
    });

    const response = await invokeMiddleware(context, next);
    assertRedirect(response, "/auth/signin");
    expect(next).not.toHaveBeenCalled();
  });

  it("redirects authenticated user without Jira token from /dashboard to /onboarding", async () => {
    const user = createMockUser();
    mockGetUser.mockResolvedValue({ data: { user }, error: null });
    mockHasToken.mockResolvedValue(false);

    const context = createMockApiContext({
      user,
      url: "http://localhost/dashboard",
    });

    const response = await invokeMiddleware(context, next);
    assertRedirect(response, "/onboarding");
    expect(mockHasToken).toHaveBeenCalledWith(user.id, "jira");
    expect(next).not.toHaveBeenCalled();
  });

  it("redirects authenticated user with Jira token from /onboarding to /dashboard", async () => {
    const user = createMockUser();
    mockGetUser.mockResolvedValue({ data: { user }, error: null });
    mockHasToken.mockResolvedValue(true);

    const context = createMockApiContext({
      user,
      url: "http://localhost/onboarding",
    });

    const response = await invokeMiddleware(context, next);
    assertRedirect(response, "/dashboard");
    expect(mockHasToken).toHaveBeenCalledWith(user.id, "jira");
    expect(next).not.toHaveBeenCalled();
  });

  it("allows authenticated user without Jira token on /settings without redirect", async () => {
    const user = createMockUser();
    mockGetUser.mockResolvedValue({ data: { user }, error: null });
    mockHasToken.mockResolvedValue(false);

    const context = createMockApiContext({
      user,
      url: "http://localhost/settings",
    });

    const response = await invokeMiddleware(context, next);
    expect(response.status).toBe(200);
    expect(mockHasToken).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("allows authenticated user with Jira token on /dashboard without redirect", async () => {
    const user = createMockUser();
    mockGetUser.mockResolvedValue({ data: { user }, error: null });
    mockHasToken.mockResolvedValue(true);

    const context = createMockApiContext({
      user,
      url: "http://localhost/dashboard",
    });

    const response = await invokeMiddleware(context, next);
    expect(response.status).toBe(200);
    expect(mockHasToken).toHaveBeenCalledWith(user.id, "jira");
    expect(next).toHaveBeenCalledOnce();
  });

  it("allows authenticated user without Jira token on /onboarding without redirect", async () => {
    const user = createMockUser();
    mockGetUser.mockResolvedValue({ data: { user }, error: null });
    mockHasToken.mockResolvedValue(false);

    const context = createMockApiContext({
      user,
      url: "http://localhost/onboarding",
    });

    const response = await invokeMiddleware(context, next);
    expect(response.status).toBe(200);
    expect(mockHasToken).toHaveBeenCalledWith(user.id, "jira");
    expect(next).toHaveBeenCalledOnce();
  });

  it("allows /dashboard when hasToken throws (fail-open degraded guard)", async () => {
    const user = createMockUser();
    mockGetUser.mockResolvedValue({ data: { user }, error: null });
    mockHasToken.mockRejectedValue(new Error("database unavailable"));

    const context = createMockApiContext({
      user,
      url: "http://localhost/dashboard",
    });

    const response = await invokeMiddleware(context, next);
    expect(response.status).toBe(200);
    expect(next).toHaveBeenCalledOnce();
  });
});
