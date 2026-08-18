import { defineConfig, devices } from '@playwright/test'

/**
 * Browser coverage for the backoffice.
 *
 * ── Hermetic on purpose ────────────────────────────────────────────────────
 *
 * Every test intercepts `/api/**` and serves its own fixtures. Nothing here
 * touches the live Worker or D1.
 *
 * That is not only about speed. The session handover records that TestSprite
 * runs "land already signed in as whoever ran last and skip the login step,
 * then report a pass while measuring the wrong role" — a test suite whose
 * result depends on residual session state is worse than no suite, because it
 * reports confidence it has not earned. Route interception removes the shared
 * state entirely: each test declares the role and the rows it is testing
 * against, and gets exactly those.
 *
 * ── What these tests are for ───────────────────────────────────────────────
 *
 * They are characterization tests written immediately before a table refactor.
 * Their job is to describe what the tables render *today* so that replacing
 * every one of them with a shared component has to prove it changed nothing.
 * A test here that needs editing during the migration is a signal, not a chore.
 */
const PORT = Number(process.env.BACKOFFICE_E2E_PORT || 5174)

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30000,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  // Windows reserves scattered TCP ranges (Hyper-V and WSL claim them), and
  // 5174 lands inside one on at least one machine here — the server fails with
  // EACCES and every test reports as "webServer did not start", which reads
  // like a broken suite rather than a taken port. Overridable so that is a
  // one-line workaround instead of an afternoon.
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // A port of its own, so a dev server already running on 5173 for the POS
    // is neither reused nor killed.
    command: `npx vite --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
})
