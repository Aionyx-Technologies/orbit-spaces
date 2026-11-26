import { defineConfig, devices } from "@playwright/test";

import { API_URL, WEB_PORT, WEB_URL } from "./tests/e2e/environment";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  expect: { timeout: 10_000 },
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npm run start -- --port ${WEB_PORT}`,
    url: WEB_URL,
    env: { ORBIT_API_URL: API_URL },
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
