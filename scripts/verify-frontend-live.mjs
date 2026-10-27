import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('.cache/playwright', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = {
  status: 'RUNNING',
  backend: null,
  viewports: [],
  consoleErrors: [],
  jobsSubmitted: 0,
};
try {
  const context = await browser.newContext({ locale: 'vi-VN' });
  const page = await context.newPage();
  page.on('pageerror', (error) => report.consoleErrors.push(error.message));
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/v1/jobs'))
      report.jobsSubmitted++;
  });
  for (const width of [1280, 768, 375]) {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : 900 });
    await page.goto('http://127.0.0.1:5173');
    await page.getByText('Máy xử lý đã kết nối').waitFor();
    const health = await page.request.get(
      'http://127.0.0.1:5173/api/v1/health',
    );
    assert.equal(health.status(), 200);
    report.backend = await health.json();
    assert.ok(report.backend.limits.maxUploadBytes > 0);
    assert.ok(
      await page
        .locator('html')
        .evaluate((root) => root.scrollWidth <= root.clientWidth),
      `Overflow at ${width}px`,
    );
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    if (accessibility.violations.length)
      report.accessibilityIssues = accessibility.violations.map((issue) => ({
        id: issue.id,
        nodes: issue.nodes.map((node) => ({
          target: node.target,
          summary: node.failureSummary,
        })),
      }));
    assert.deepEqual(
      accessibility.violations.map((item) => item.id),
      [],
      `Accessibility at ${width}px`,
    );
    await page.screenshot({
      path: `.cache/playwright/live-${width}.png`,
      fullPage: true,
    });
    report.viewports.push({
      width,
      overflow: false,
      accessibilityViolations: 0,
    });
  }
  await page
    .getByLabel('Chọn tệp nhạc', { exact: true })
    .setInputFiles('.cache/playwright/vocals-ui-fixture.wav');
  await page.getByText('vocals-ui-fixture.wav', { exact: true }).waitFor();
  assert.ok(
    await page
      .locator('html')
      .evaluate((root) => root.scrollWidth <= root.clientWidth),
  );
  await page.screenshot({
    path: '.cache/playwright/live-mobile-selected.png',
    fullPage: true,
  });
  assert.equal(report.jobsSubmitted, 0);
  assert.deepEqual(report.consoleErrors, []);
  report.status = 'PASS';
  console.log(
    'Live frontend PASS: real backend limits/health, 1280/768/375px, accessibility, file picker; no inference submitted.',
  );
} catch (error) {
  report.status = 'FAILED';
  report.error = error.message;
  console.error(
    'Live frontend verification failed; see docs/reports/epic-04-live.json',
  );
  process.exitCode = 1;
} finally {
  await writeFile(
    'docs/reports/epic-04-live.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
}
