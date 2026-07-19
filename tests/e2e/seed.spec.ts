// Seed exemplar — every generated E2E test is modeled on this file.
// Risk anchor: test-plan.md #7 — loading indicator visible during slow sprint fetch.
// storageState loaded project-wide from playwright/.auth/user.json (playwright.config.ts).

import { test, expect } from "@playwright/test";

test("sprint fetch progress indicator visible before data resolves", async ({ page }) => {
  // Stub boards API with a controlled delay — no real Jira latency in tests.
  let resolveBoardsRequest!: () => void;
  const boardsDelayed = new Promise<void>((resolve) => {
    resolveBoardsRequest = resolve;
  });

  await page.route("**/api/jira/boards", async (route) => {
    await boardsDelayed;
    await route.continue();
  });

  await page.goto("/");

  // Loading spinner must be visible while request is in-flight.
  const spinner = page.locator('[aria-busy="true"]');
  await expect(spinner).toBeVisible();

  // Release the stubbed request.
  resolveBoardsRequest();
  await page.waitForResponse("**/api/jira/boards");

  // Spinner gone; board selector ready.
  await expect(spinner).not.toBeVisible();
  await expect(page.getByRole("combobox", { name: "Board" })).toBeVisible();
});
