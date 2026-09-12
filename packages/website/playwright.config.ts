import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  testMatch: "**/*.browser.ts",
  fullyParallel: true,
  workers: 3,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4178",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "compact", use: { viewport: { width: 1024, height: 900 } } },
    {
      name: "mobile-small",
      use: { viewport: { width: 320, height: 568 }, hasTouch: true },
    },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    {
      name: "mobile-wide",
      use: { viewport: { width: 430, height: 932 }, hasTouch: true },
    },
    {
      name: "iphone-webkit",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
    {
      name: "tablet-touch",
      use: { viewport: { width: 820, height: 1180 }, hasTouch: true },
    },
    {
      name: "iphone-landscape",
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        viewport: { width: 844, height: 390 },
        contextOptions: { screen: { width: 844, height: 390 } },
      },
    },
  ],
  webServer: {
    command:
      "bun run build && bunx --no-install vite preview --host 127.0.0.1 --port 4178 --strictPort",
    url: "http://127.0.0.1:4178",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
