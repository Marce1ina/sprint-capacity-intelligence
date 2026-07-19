import { test as setup, expect } from "@playwright/test";

const authFile = "playwright/.auth/user.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/");

  // If auth state is valid, we land on dashboard — done.
  if (!page.url().includes("/auth/signin")) {
    await expect(page.getByRole("heading", { name: "Sprint capacity" })).toBeVisible();
    await page.context().storageState({ path: authFile });
    return;
  }

  // Session expired: open Google OAuth in headed mode and wait for manual completion.
  console.log("\n⚠ Session expired. Complete Google login in the browser window.");
  await page.waitForURL("**/", { timeout: 120_000 });
  await expect(page.getByRole("heading", { name: "Sprint capacity" })).toBeVisible();

  await page.context().storageState({ path: authFile });
});
