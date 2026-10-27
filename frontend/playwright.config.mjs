import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: 'studio.spec.mjs',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 12000 },
  outputDir: '../.cache/playwright/results',
  reporter: 'list',
  use: {
    channel: 'msedge',
    headless: true,
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 1440, height: 1000 },
    locale: 'vi-VN',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node frontend/test/fixture-server.mjs',
      url: 'http://127.0.0.1:3101/api/v1/health',
      cwd: '..',
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: 'npm.cmd run dev:frontend -- --port 5174',
      url: 'http://127.0.0.1:5174',
      cwd: '..',
      env: { API_PROXY_TARGET: 'http://127.0.0.1:3101' },
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
