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
