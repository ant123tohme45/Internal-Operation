import { defineConfig } from '@playwright/test';

/**
 * E2E config for the full stack: a real backend (its own throwaway SQLite
 * file, via DB_PATH) and a real frontend build, both started fresh for the
 * test run. See docs/full-stack-delivery.md, "E2E test".
 *
 * Each run gets its own database filename (timestamped) instead of reusing
 * and deleting one fixed file — deleting a shared file races against the
 * backend process opening it, which on Windows fails with EBUSY.
 */
const dbPath = `../e2e/.tmp/e2e-${Date.now()}.sqlite`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // Invoke node directly (not "npm run start") — on Windows, killing the
      // npm wrapper process leaves its node child running and holding the
      // port, so the next run fails with "port already in use".
      command: 'node dist/main.js',
      cwd: 'backend',
      url: 'http://localhost:3002/api/service-requests/reference/employees',
      env: {
        PORT: '3002',
        DB_PATH: dbPath,
      },
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      // Same reasoning: invoke Vite's JS entrypoint directly instead of
      // through "npm run dev", so Playwright can actually kill the process
      // it started. Dev server (not a production preview build) so
      // VITE_API_URL below is honoured — a production build inlines env
      // vars at build time, which would silently point this test at the
      // wrong backend.
      command: 'node node_modules/vite/bin/vite.js --port 5174 --strictPort',
      cwd: 'frontend',
      url: 'http://localhost:5174',
      env: {
        VITE_API_URL: 'http://localhost:3002',
      },
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
