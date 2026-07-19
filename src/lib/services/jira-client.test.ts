import { afterEach, describe, expect, it, vi } from "vitest";
import { SECRET_PROBE, TEST_JIRA_SITE } from "@/test/fixtures";
import { assertNoSecretProbe } from "@/test/secret-scan";
import { JiraValidationError } from "@/types";
import { getSprintById, listBoards } from "@/lib/services/jira-client";

describe("jira-client error sanitization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws fixed userMessage on 401 without echoing upstream PAT from response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: `Invalid token ${SECRET_PROBE}` }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(listBoards(TEST_JIRA_SITE, SECRET_PROBE, "user@example.com")).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(JiraValidationError);
      const validationError = error as JiraValidationError;
      assertNoSecretProbe({ message: validationError.userMessage }, SECRET_PROBE);
      expect(validationError.userMessage).toBe(
        "Invalid Jira credentials. Check your API token and ensure your Atlassian account uses the same email as your Google sign-in.",
      );
      return true;
    });
  });
});

describe("getSprintById", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches a single sprint's window directly by sprintId, without needing a boardId", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 99,
          name: "Sprint 99",
          state: "active",
          startDate: "2026-07-01",
          endDate: "2026-07-14",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const sprint = await getSprintById(TEST_JIRA_SITE, SECRET_PROBE, "user@example.com", 99);

    expect(sprint).toEqual({
      id: 99,
      name: "Sprint 99",
      state: "active",
      startDate: "2026-07-01",
      endDate: "2026-07-14",
    });
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe("/rest/agile/1.0/sprint/99");
  });
});
