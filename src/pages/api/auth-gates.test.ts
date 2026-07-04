import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { integrationTokenServiceMockModule } from "@/test/mock-integration-token-service";
import { mockAstroEnvServer } from "@/test/mock-server-deps";
import { supabaseClientMockModule } from "@/test/mock-supabase-client";
import { createMockApiContext } from "@/test/mock-api-context";

vi.mock("astro:env/server", () => mockAstroEnvServer);
vi.mock("@/lib/supabase", () => supabaseClientMockModule());
vi.mock("@/lib/services/integration-token-service", () => integrationTokenServiceMockModule());

import { GET as getBoards } from "@/pages/api/jira/boards";
import { POST as postOnboardingJira } from "@/pages/api/onboarding/jira";

describe("API routes — auth gate contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET /api/jira/boards returns 401 JSON when unauthenticated", async () => {
    const context = createMockApiContext({
      user: null,
      url: "http://localhost/api/jira/boards",
    });

    const response = await getBoards(context);
    expect(response.status).toBe(401);

    const body = (await response.json()) as { error: string };
    expect(body).toEqual({ error: "Authentication required." });
  });

  it("POST /api/onboarding/jira redirects unauthenticated requests to sign-in", async () => {
    const context = createMockApiContext({
      user: null,
      url: "http://localhost/api/onboarding/jira",
      method: "POST",
    });

    const response = await postOnboardingJira(context);
    expect(response.status).toBe(302);

    const location = response.headers.get("Location") ?? "";
    expect(location).toContain("/auth/signin");
  });
});
