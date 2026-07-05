// Risk anchor: board → sprint → assignees cascade must surface correct story-point
// data for each selected sprint without silent failure at any boundary.
// Seed: tests/e2e/seed.spec.ts — same storageState, getByRole locators, waitForResponse.

import { test, expect } from "@playwright/test";

test("board → sprint selection cascade reveals assignee story points", async ({ page }) => {
  // Mock Jira-backed API routes — external, non-deterministic; routing + auth stay real.
  await page.route("**/api/jira/boards", async (route) => {
    await route.fulfill({ json: { boards: [{ id: 42, name: "Test Board", type: "scrum" }] } });
  });

  await page.route("**/api/jira/boards/42/sprints", async (route) => {
    await route.fulfill({
      json: { sprints: [{ id: 100, name: "Sprint 1", state: "active" }] },
    });
  });

  await page.route("**/api/jira/sprints/100/assignees", async (route) => {
    await route.fulfill({
      json: {
        assignees: [
          { accountId: "user-1", displayName: "Alice", totalStoryPoints: 13 },
          { accountId: "user-2", displayName: "Bob", totalStoryPoints: 8 },
        ],
        sprintId: 100,
      },
    });
  });

  // Arm before navigation so the response isn't missed.
  const boardsLoaded = page.waitForResponse("**/api/jira/boards");
  await page.goto("/dashboard");
  await boardsLoaded;

  // Board combobox ready with options.
  const boardSelect = page.getByRole("combobox", { name: "Board" });
  await expect(boardSelect).toBeVisible();

  // Select a board — triggers sprint fetch.
  const sprintsLoaded = page.waitForResponse("**/api/jira/boards/42/sprints");
  await boardSelect.click();
  await page.getByRole("option", { name: "Test Board" }).click();
  await sprintsLoaded;

  // Sprint combobox becomes enabled once sprints load (disabled while empty).
  const sprintSelect = page.getByRole("combobox", { name: "Sprint" });
  await expect(sprintSelect).toBeEnabled();

  // Select a sprint — triggers assignees fetch.
  const assigneesLoaded = page.waitForResponse("**/api/jira/sprints/100/assignees");
  await sprintSelect.click();
  await page.getByRole("option", { name: "Sprint 1 (active)" }).click();
  await assigneesLoaded;

  // Table headers present.
  await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Story Points" })).toBeVisible();

  // Story points verified per-assignee row — swapped values would fail.
  const aliceRow = page.getByRole("row").filter({ hasText: "Alice" });
  await expect(aliceRow.getByRole("cell", { name: "13" })).toBeVisible();

  const bobRow = page.getByRole("row").filter({ hasText: "Bob" });
  await expect(bobRow.getByRole("cell", { name: "8" })).toBeVisible();
});
