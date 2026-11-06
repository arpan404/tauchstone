import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', workers: 1, retries: 0, timeout: 300000,
  use: { channel: process.env.TS_E2E_CHANNEL || 'chromium', baseURL: process.env.TS_E2E_BASE_URL || 'http://localhost:8080',
    viewport: { width: 1920, height: 1080 },
    video: { mode: 'on', size: { width: 1920, height: 1080 } },
    trace: 'retain-on-failure' },
});
