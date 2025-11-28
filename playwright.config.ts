import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['./tests/database-reporter.ts']
  ],
  timeout: 60000,
  globalSetup: './tests/global-setup.ts',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    navigationTimeout: 30000,
    actionTimeout: 15000,
    // Enable audio and autoplay for music player tests
    launchOptions: {
      args: [
        '--autoplay-policy=no-user-gesture-required',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    },
  },

  // Pass environment variables to test workers
  env: {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    TEST_ADMIN_EMAIL: process.env.TEST_ADMIN_EMAIL!,
    TEST_ADMIN_PASSWORD: process.env.TEST_ADMIN_PASSWORD!,
    TEST_USER_EMAIL: process.env.TEST_USER_EMAIL!,
    TEST_USER_PASSWORD: process.env.TEST_USER_PASSWORD!,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: false, // Always restart to pick up new env vars
    timeout: 180000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      // Pass Vite environment variables from .env.test to the dev server
      VITE_STORAGE_BACKEND: process.env.VITE_STORAGE_BACKEND!,
      VITE_CDN_DOMAIN: process.env.VITE_CDN_DOMAIN!,
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL!,
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY!,
      VITE_SUPABASE_SERVICE_ROLE_KEY: process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!,
    },
  },
});
