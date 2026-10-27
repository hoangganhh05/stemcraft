import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

const fixture = 'http://127.0.0.1:3101';
async function selectAudio(page, request) {
  const response = await request.get(`${fixture}/__test/fixture.wav`);
  await page.getByLabel('Chọn tệp nhạc', { exact: true }).setInputFiles({
    name: 'Bản nhạc thử.wav',
    mimeType: 'audio/wav',
    buffer: await response.body(),
  });
}
test.beforeEach(async ({ request }) => {
  await request.post(`${fixture}/__test/reset`, { data: {} });
});

test('desktop: upload, real progress, three players, authenticated streaming/download and reload', async ({
  page,
  request,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('Máy xử lý đã kết nối')).toBeVisible();
  await mkdir('.cache/playwright', { recursive: true });
  await page.screenshot({
    path: '.cache/playwright/studio-desktop.png',
    fullPage: true,
  });
  await selectAudio(page, request);
  await page.getByRole('button', { name: 'Tách vocal', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '33',
  );
  await expect(
    page.getByRole('heading', { name: 'Bản tách đã sẵn sàng.' }),
  ).toBeVisible();
  await expect(page.locator('audio')).toHaveCount(3);
  await expect
    .poll(() =>
      page.getByTestId('player-vocals').evaluate((audio) => audio.readyState),
    )
    .toBeGreaterThan(0);
  await page.getByTestId('player-vocals').evaluate((audio) => audio.play());
  await expect
    .poll(() =>
      page.getByTestId('player-vocals').evaluate((audio) => audio.paused),
    )
    .toBe(false);
  await page.getByTestId('player-vocals').evaluate((audio) => {
    audio.pause();
    audio.currentTime = 0.25;
  });
  await expect
    .poll(() =>
      page.getByTestId('player-vocals').evaluate((audio) => audio.currentTime),
    )
    .toBeGreaterThan(0);
  const waiting = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Tải vocal WAV', exact: true })
    .click();
  const download = await waiting;
  expect(download.suggestedFilename()).toBe('vocals.wav');
  await download.saveAs('.cache/playwright/vocals-ui-fixture.wav');
  const downloaded = await readFile('.cache/playwright/vocals-ui-fixture.wav');
  expect(downloaded.toString('ascii', 0, 4)).toBe('RIFF');
  expect(downloaded.toString('ascii', 8, 12)).toBe('WAVE');
  expect(downloaded.length).toBe(44 + 44100 * 4);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Bản tách đã sẵn sàng.' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.getByTestId('player-original').evaluate((audio) => audio.readyState),
    )
    .toBeGreaterThan(0);
  const media = await (await request.get(`${fixture}/__test/media`)).json();
  expect(media.length).toBeGreaterThan(0);
  expect(media.every((entry) => entry.authenticated)).toBe(true);
  expect(media.some((entry) => entry.range)).toBe(true);
  expect(page.url()).not.toContain('token');
  expect(
    await page
      .locator('audio')
      .evaluateAll((players) =>
        players.every((audio) => !audio.src.includes('token')),
      ),
  ).toBe(true);
  await page.screenshot({
    path: '.cache/playwright/studio-results.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test('mobile 375px: keyboard access, invalid file, guide and no horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Đến vùng làm việc' }),
  ).toBeFocused();
  await page.getByLabel('Chọn tệp nhạc', { exact: true }).setInputFiles({
    name: 'wrong.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not audio'),
  });
  await expect(page.getByRole('alert')).toContainText('MP3, WAV hoặc FLAC');
  await expect(
    page.getByRole('button', { name: 'Tách vocal', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Đóng thông báo lỗi' }).click();
  await page.screenshot({
    path: '.cache/playwright/studio-mobile.png',
    fullPage: true,
  });
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('link', { name: 'Hướng dẫn', exact: true }).click();
  await expect(page.locator('#huong-dan')).toHaveAttribute('open', '');
});

test('cancel a processing job without fake completion; allow a new file', async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__test/reset`, { data: { scenario: 'hold' } });
  await page.goto('/');
  await selectAudio(page, request);
  await page.getByRole('button', { name: 'Tách vocal', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '33',
  );
  await page.getByRole('button', { name: 'Hủy tác vụ', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Tác vụ đã được hủy.' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tải vocal WAV' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Chọn lại bản nhạc' }).click();
  await expect(page.getByLabel('Chọn tệp nhạc', { exact: true })).toHaveCount(
    1,
  );
});

test('worker error and expired jobs have clear recovery without download controls', async ({
  page,
  request,
}) => {
  for (const scenario of ['failed', 'expired']) {
    await request.post(`${fixture}/__test/reset`, { data: { scenario } });
    await page.goto('/');
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await selectAudio(page, request);
    await page.getByRole('button', { name: 'Tách vocal', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name:
          scenario === 'failed'
            ? 'Chưa thể hoàn tất bản tách.'
            : 'Tệp đã hết hạn.',
      }),
    ).toBeVisible();
    if (scenario === 'failed')
      await expect(page.getByText(/Máy không đủ bộ nhớ/)).toBeVisible();
    await expect(page.locator('.download-button')).toHaveCount(0);
  }
});
