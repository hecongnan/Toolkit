import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: false,
  workers: 1,
  timeout: 40_000,
  expect: { timeout: 8_000 },
  reporter: "list",
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:3107",
    browserName: "chromium",
    timezoneId: "Asia/Shanghai",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.TOOLKIT_TEST_BROWSER
      ? { executablePath: process.env.TOOLKIT_TEST_BROWSER }
      : {},
  },
  webServer: {
    command: "npm run build && npm run start -- -H 127.0.0.1 -p 3107",
    url: "http://127.0.0.1:3107/login",
    timeout: 150_000,
    reuseExistingServer: false,
    // Never use an actual account or database in these tests.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://frontend-preview.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "preview-only-not-a-real-key",
    },
  },
});
