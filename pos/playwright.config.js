import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: [
    {
      command: 'cd .. && python3 server_secure.py',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 10000,
    },
    {
      command: 'npx vite --host 0.0.0.0 --port 5173',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 10000,
    },
  ],
})
