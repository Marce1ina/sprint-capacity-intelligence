import { defineConfig } from "@playwright/test";

export default defineConfig({
  use: {
    baseURL: "http://localhost:4321",
    storageState: "playwright/.auth/user.json",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { storageState: undefined } },
    {
      name: "chromium",
      use: { storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
});
