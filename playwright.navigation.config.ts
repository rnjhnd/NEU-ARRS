import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./scripts/navigation-checks",
  testMatch: "**/*.pw.ts", // Kept separate from Vitest's *.test/spec discovery.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 20_000,
  expect: { timeout: 5000 },
  outputDir: "./test-results/navigation",
  reporter: process.env.CI ? [["list"], ["github"], ["html", { open: "never" }]] : "list",
  use: {
    channel: "chrome",
    headless: true,
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
