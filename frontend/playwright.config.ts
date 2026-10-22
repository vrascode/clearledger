import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.CLEARLEDGER_TEST_URL ?? "http://127.0.0.1:13000",
    viewport: { width: 1440, height: 1050 },
    screenshot: "only-on-failure",
    trace: "off",
    video: "off",
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "reduce",
  },
});
