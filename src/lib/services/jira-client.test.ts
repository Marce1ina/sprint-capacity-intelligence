import { afterEach, describe, expect, it, vi } from "vitest";
import { SECRET_PROBE, TEST_JIRA_SITE } from "@/test/fixtures";
import { assertNoSecretProbe } from "@/test/secret-scan";
import { JiraValidationError } from "@/types";
import { listBoards } from "@/lib/services/jira-client";

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
