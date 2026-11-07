import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL:
      process.env.E2E_BASE_URL ??
      `${fs.existsSync("./localhost+1.pem") ? "https" : "http"}://localhost:${
        process.env.E2E_PORT ?? "3000"
      }`,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      testMatch:
        /(app-boot|sketch-controls|sketch-rectangle|undo-chain)\.spec\.ts/,
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testMatch:
        /(app-boot|sketch-controls|sketch-rectangle|undo-chain)\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${process.env.E2E_PORT ?? "3000"} --strictPort`,
    port: Number(process.env.E2E_PORT ?? 3000),
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
