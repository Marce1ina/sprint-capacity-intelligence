import { beforeEach, describe, expect, it, vi } from "vitest";
import { SECRET_PROBE, TEST_JIRA_SITE } from "@/test/fixtures";
import { integrationTokenServiceMockModule, mockGetJiraPat } from "@/test/mock-integration-token-service";
import { mockAstroEnvServer } from "@/test/mock-server-deps";
import { mockSupabaseCreateClient, supabaseClientMockModule } from "@/test/mock-supabase-client";
import { createMockApiContext, createMockUser } from "@/test/mock-api-context";
import { assertNoSecretProbe } from "@/test/secret-scan";
import { JiraValidationError } from "@/types";

vi.mock("astro:env/server", () => mockAstroEnvServer);
vi.mock("@/lib/supabase", () => supabaseClientMockModule());
vi.mock("@/lib/services/integration-token-service", () => integrationTokenServiceMockModule());

import { jsonError, mapJiraClientError, resolveJiraApiContext } from "@/lib/jira-api-context";

describe("jsonError", () => {
  it("returns exactly { error: message } with no extra keys", async () => {
    const response = jsonError(401, "Authentication required.");
    expect(response.status).toBe(401);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ error: "Authentication required." });
    expect(Object.keys(body)).toEqual(["error"]);
  });
});

describe("mapJiraClientError", () => {
  it("maps JiraValidationError to 400 with userMessage only", async () => {
    const response = mapJiraClientError(new JiraValidationError("Invalid Jira credentials."), "fallback");
    expect(response.status).toBe(400);

    const body = (await response.json()) as { error: string };
    expect(body).toEqual({ error: "Invalid Jira credentials." });
    assertNoSecretProbe(body, SECRET_PROBE);
  });

  it("maps generic errors to fallback without echoing probe substrings", async () => {
    const response = mapJiraClientError(new Error(SECRET_PROBE), "Could not load boards from Jira. Please try again.");
    expect(response.status).toBe(500);

    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("Could not load boards from Jira. Please try again.");
    assertNoSecretProbe(body, SECRET_PROBE);
  });
});

describe("resolveJiraApiContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseCreateClient.mockReturnValue({});
  });

  it("returns 401 when context.locals.user is missing", async () => {
    const context = createMockApiContext({ user: null });
    const result = await resolveJiraApiContext(context);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    const body = (await (result as Response).json()) as unknown;
    assertNoSecretProbe(body, SECRET_PROBE);
  });

  it("returns 503 when getJiraPat throws", async () => {
    mockGetJiraPat.mockRejectedValue(new Error("database unavailable"));

    const context = createMockApiContext({ user: createMockUser() });
    const result = await resolveJiraApiContext(context);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(503);

    const body = (await (result as Response).json()) as { error: string };
    expect(body).toEqual({ error: "Could not load Jira credentials. Please try again later." });
    assertNoSecretProbe(body, SECRET_PROBE);
  });

  it("returns JiraApiContext on success and mistaken JSON serialization would leak probe", async () => {
    mockGetJiraPat.mockResolvedValue({
      pat: SECRET_PROBE,
      siteUrl: TEST_JIRA_SITE,
    });

    const context = createMockApiContext({ user: createMockUser() });
    const result = await resolveJiraApiContext(context);

    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) {
      throw new Error("expected JiraApiContext");
    }

    expect(result.pat).toBe(SECRET_PROBE);
    expect(result.siteUrl).toBe(TEST_JIRA_SITE);

    // Documents anti-pattern: spreading resolved context into a Response body must not happen.
    const mistakenBody = { ...result };
    expect(() => {
      assertNoSecretProbe(mistakenBody, SECRET_PROBE);
    }).toThrow(/SECRET_PROBE/);
  });

  it("returns 400 with userMessage when site URL validation fails", async () => {
    mockGetJiraPat.mockResolvedValue({
      pat: "pat-only-for-validation",
      siteUrl: "https://evil.example.com",
    });

    const context = createMockApiContext({ user: createMockUser() });
    const result = await resolveJiraApiContext(context);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);

    const body = (await (result as Response).json()) as unknown;
    assertNoSecretProbe(body, "pat-only-for-validation");
  });
});
