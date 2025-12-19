import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test environment variables from .env.test
dotenv.config({ path: path.resolve(__dirname, ".env.test") });

// Playwright defaults to using `chromium-headless-shell` in headless mode.
// For our audio-focused E2E suite, we prefer full Chromium to avoid feature gaps.
process.env.PW_CHROMIUM_USE_HEADLESS_SHELL = "0";

// On some macOS + Apple Silicon setups, Playwright can mis-detect the host platform as x64.
// Force the correct platform so browser downloads/executables resolve consistently.
if (process.platform === "darwin" && process.arch === "arm64") {
  process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE ??= "mac-arm64";
}

// IMPORTANT: use a dynamic import so the env overrides above are set
// before Playwright initializes and decides which browser binary to use.
const { defineConfig, devices } = await import("@playwright/test");

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 30000,

  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      // Use Playwright-managed Chromium for stability in constrained environments.
      // (Using the system "Chrome for Testing" channel can crash due to OS permission prompts.)
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
