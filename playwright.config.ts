import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ quiet: true });
if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    "Set TEST_DATABASE_URL to a disposable migrated PostgreSQL database before browser tests",
  );
const baseURL = "http://localhost:3310";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "npm run dev -w @duel/web -- --port 3310",
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        WEB_ORIGIN: baseURL,
        PRACTICE_DEMO: "true",
        ANALYTICS_ENABLED: "true",
        NEXT_TELEMETRY_DISABLED: "1",
        SEARCH_INDEXING_ENABLED: "false",
        SITE_URL: baseURL,
        REALTIME_PORT: "3311",
      },
    },
    {
      command: "npm run dev -w @duel/realtime",
      url: "http://127.0.0.1:3311/health",
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        WEB_ORIGIN: baseURL,
        REALTIME_PORT: "3311",
        PRACTICE_DEMO: "true",
        ANALYTICS_ENABLED: "true",
        DUEL_QUESTION_SECONDS: "20",
        DUEL_REVEAL_SECONDS: "2",
        DUEL_RECONNECT_SECONDS: "5",
      },
    },
  ],
});
