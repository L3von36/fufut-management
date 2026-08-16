import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

/**
 * Mirrors pos/vitest.config.js so the two apps behave the same way under test.
 *
 * The backoffice had no test suite at all until the HR screens were added. That
 * is how AuditLogView shipped calling an endpoint that returned 404 for as long
 * as it existed: it rendered an empty table, which is indistinguishable from a
 * quiet day, and nothing was watching.
 */
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    /**
     * The timezone is pinned in the npm script, not here.
     *
     * This app serves a business in Addis Ababa (UTC+3) and stores timestamps
     * in UTC, so almost every date assertion depends on the gap between the
     * two. Left to the runner's zone the same test passes locally and fails in
     * CI — a 22:30 UTC stamp is a 01:30 sale in Addis and a 22:30 sale in
     * London, and both are correct renderings. That is not hypothetical; it is
     * how this note came to be.
     *
     * `test.env` cannot fix it: Node reads TZ once at process start and caches
     * it, so setting it after the runner has booted changes nothing. It has to
     * be set before node launches, which is why package.json uses cross-env.
     */
    include: ['tests/unit/**/*.{test,spec}.{js,ts}'],
    setupFiles: ['./tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{js,vue}'],
      exclude: ['src/main.js'],
    },
  },
})
