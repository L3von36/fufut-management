import { defineConfig, devices } from '@playwright/test'

const isCI = !!process.env.CI

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: isCI ? 2 : 0,
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
  ],
  webServer: [
    // In CI, skip the local Python backend — the Vite dev server proxies
    // /api/* to the live Cloudflare Worker, so no local server is needed.
    ...(!isCI ? [{
      command: 'cd .. && python3 server_secure.py',
      port: 3000,
      reuseExistingServer: true,
      timeout: 15000,
    }] : []),
    {
      command: 'npx vite --host 0.0.0.0 --port 5173',
      port: 5173,
      reuseExistingServer: !isCI,
      timeout: 30000,
    },
  ],
})

