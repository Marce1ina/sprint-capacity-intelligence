import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SECRET_PROBE } from "@/test/fixtures";
import {
  boardsPage,
  mockJiraFetchSuccess,
  mockJiraFetchUnauthorized,
  setupAuthenticatedJiraUser,
  sprintIssuesPage,
  sprintsPage,
} from "@/test/jira-route-mocks";
import { integrationTokenServiceMockModule } from "@/test/mock-integration-token-service";
import { mockAstroEnvServer } from "@/test/mock-server-deps";
import { supabaseClientMockModule } from "@/test/mock-supabase-client";
import { assertResponseBodyHasNoSecretProbe } from "@/test/secret-scan";

vi.mock("astro:env/server", () => mockAstroEnvServer);
vi.mock("@/lib/supabase", () => supabaseClientMockModule());
vi.mock("@/lib/services/integration-token-service", () => integrationTokenServiceMockModule());

import { GET as getBoards } from "@/pages/api/jira/boards";
import { GET as getSprints } from "@/pages/api/jira/boards/[boardId]/sprints";
import { GET as getAssignees } from "@/pages/api/jira/sprints/[sprintId]/assignees";

describe("Jira JSON route handlers — secret scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GET /api/jira/boards success response has no probe PAT", async () => {
    mockJiraFetchSuccess(boardsPage);
    const context = setupAuthenticatedJiraUser();

    const response = await getBoards(context);
    expect(response.status).toBe(200);
    await assertResponseBodyHasNoSecretProbe(response, SECRET_PROBE);
  });

  it("GET /api/jira/boards error response has no probe PAT on Jira 401", async () => {
    mockJiraFetchUnauthorized();
    const context = setupAuthenticatedJiraUser();

    const response = await getBoards(context);
    expect(response.status).toBe(400);
    await assertResponseBodyHasNoSecretProbe(response, SECRET_PROBE);
  });

  it("GET /api/jira/boards/[boardId]/sprints success response has no probe PAT", async () => {
    mockJiraFetchSuccess(sprintsPage);
    const context = setupAuthenticatedJiraUser();
    context.params = { boardId: "1" };

    const response = await getSprints(context);
    expect(response.status).toBe(200);
    await assertResponseBodyHasNoSecretProbe(response, SECRET_PROBE);
  });

  it("GET /api/jira/boards/[boardId]/sprints error response has no probe PAT on Jira 401", async () => {
    mockJiraFetchUnauthorized();
    const context = setupAuthenticatedJiraUser();
    context.params = { boardId: "1" };

    const response = await getSprints(context);
    expect(response.status).toBe(400);
    await assertResponseBodyHasNoSecretProbe(response, SECRET_PROBE);
  });

  it("GET /api/jira/sprints/[sprintId]/assignees success response has no probe PAT", async () => {
    mockJiraFetchSuccess(sprintIssuesPage);
    const context = setupAuthenticatedJiraUser();
    context.params = { sprintId: "10" };

    const response = await getAssignees(context);
    expect(response.status).toBe(200);
    await assertResponseBodyHasNoSecretProbe(response, SECRET_PROBE);
  });

  it("GET /api/jira/sprints/[sprintId]/assignees error response has no probe PAT on Jira 401", async () => {
    mockJiraFetchUnauthorized();
    const context = setupAuthenticatedJiraUser();
    context.params = { sprintId: "10" };

    const response = await getAssignees(context);
    expect(response.status).toBe(400);
    await assertResponseBodyHasNoSecretProbe(response, SECRET_PROBE);
  });
});
