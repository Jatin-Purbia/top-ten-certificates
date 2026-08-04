import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: [
    {
      command: "npm run dev -w @pathey/api",
      url: "http://localhost:4000/api/docs",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev -w @pathey/web",
      url: "http://localhost:3000/admin/login",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
