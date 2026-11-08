import { defineConfig } from '@playwright/test';

const record = process.env.TS_E2E_RECORD !== '0';
export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', workers: 1, retries: 0, timeout: 300000,
  use: { channel: process.env.TS_E2E_CHANNEL || 'chrome', baseURL: process.env.TS_E2E_BASE_URL || 'http://localhost:8080',
    // Headless Chrome's screencast drops the bottom ~90 px of the page on macOS, which hides the
    // boundary line; record headed at a size that fits a laptop screen.
    headless: !record,
    viewport: { width: 1600, height: 900 },
    video: { mode: record ? 'on' : 'off', size: { width: 1600, height: 900 } },
    trace: 'retain-on-failure' },
});
