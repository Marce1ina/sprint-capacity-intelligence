import { describe, expect, it } from "vitest";
import { jsonError } from "@/lib/jira-api-context";

describe("Vitest bootstrap", () => {
  it("resolves @/ path aliases and imports Astro app modules", async () => {
    const response = jsonError(401, "Authentication required.");
    expect(response.status).toBe(401);

    const body = (await response.json()) as { error: string };
    expect(body).toEqual({ error: "Authentication required." });
  });
});
