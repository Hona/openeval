import { defineConfig } from "@playwright/test";

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
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command:
      "bun run build && bunx --no-install vite preview --host 127.0.0.1 --port 4178 --strictPort",
    url: "http://127.0.0.1:4178",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
