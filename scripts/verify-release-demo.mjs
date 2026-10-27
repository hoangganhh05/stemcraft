import { chromium, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { freemem } from 'node:os';
import { loadConfig, loadEnv, ROOT } from '../backend/src/config.mjs';

if (!process.argv.includes('--run'))
  throw new Error(
    'Use --run for one real AI browser demo; starts a short inference job.',
  );
loadEnv();
const config = loadConfig();
const reportPath = resolve(ROOT, 'docs/reports/epic-06-real-demo.json');
const report = {
  generatedAt: new Date().toISOString(),
  status: 'RUNNING',
  scope:
    'Browser → live API → real AI worker → preview/seek/download/reload, one-second clip; not quality or full-track acceptance',
  profileId: config.profile.id,
  freeRamMiB: Math.round(freemem() / 1024 ** 2),
  minimumStartRamMiB: 2560,
};
const save = () =>
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
let browser,
  context,
  job,
  completed = false;
const started = Date.now();
try {
  if (report.freeRamMiB < report.minimumStartRamMiB) {
    report.status = 'BLOCKED';
    report.reason = 'INSUFFICIENT_AVAILABLE_RAM';
    process.exitCode = 2;
  } else {
    const health = await fetch('http://127.0.0.1:5173/api/v1/health');
    if (
      health.status !== 200 ||
      (await health.json()).scope !== 'local_development'
    )
      throw new Error('LIVE_SERVERS_REQUIRED');
    const folder = await mkdtemp(resolve(ROOT, '.cache/epic6-demo-'));
    report.artifactDirectory = relative(ROOT, folder);
    const fixture = resolve(folder, 'technical-one-second.wav');
    await promisify(execFile)(
      config.ffmpeg,
      [
        '-nostdin',
        '-v',
        'error',
        '-n',
        '-ss',
        '1',
        '-i',
        resolve(ROOT, 'samples/repair-hoa-sua-8s.wav'),
        '-t',
        '1',
        '-ar',
        '44100',
        '-ac',
        '2',
        '-c:a',
        'pcm_s16le',
        fixture,
      ],
      { windowsHide: true, timeout: 30000 },
    );
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5173');
    await expect(page.getByText('Máy xử lý đã kết nối')).toBeVisible();
    await page
      .getByLabel('Chọn tệp nhạc', { exact: true })
      .setInputFiles(fixture);
    const accepted = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/jobs' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Tách vocal', exact: true }).click();
    const response = await accepted;
    if (response.status() !== 202) throw new Error('UPLOAD_FAILED');
    job = await response.json();
    report.jobId = job.id;
    console.log(`Real browser job ${job.id}; credentials are not logged.`);
    const deadline = Date.now() + 30 * 60 * 1000;
    while (Date.now() < deadline) {
      const statusResponse = await context.request.get(
        `http://127.0.0.1:5173/api/v1/jobs/${job.id}`,
        { headers: { Authorization: `Bearer ${job.token}` } },
      );
      if (!statusResponse.ok()) throw new Error('STATUS_FAILED');
      const state = await statusResponse.json();
      console.log(
        `${state.status}: ${state.completedChunks}/${state.totalChunks}`,
      );
      report.lastState = {
        status: state.status,
        completedChunks: state.completedChunks,
        totalChunks: state.totalChunks,
      };
      await save();
      if (state.status === 'FAILED')
        throw new Error(
          ['MEMORY_LIMIT', 'TIMEOUT', 'WORKER_INTERRUPTED'].includes(
            state.errorCode,
          )
            ? state.errorCode
            : 'WORKER_FAILED',
        );
      if (state.status === 'COMPLETED') {
        completed = true;
        break;
      }
      await new Promise((done) => setTimeout(done, 15000));
    }
    if (!completed) throw new Error('DEMO_TIMEOUT');
    await expect(
      page.getByRole('heading', { name: 'Bản tách đã sẵn sàng.' }),
    ).toBeVisible({ timeout: 20000 });
    for (const tone of ['original', 'vocals', 'instrumental']) {
      const player = page.getByTestId(`player-${tone}`);
      await expect
        .poll(() => player.evaluate((audio) => audio.readyState), {
          timeout: 20000,
        })
        .toBeGreaterThan(0);
      await player.evaluate(async (audio) => {
        await audio.play();
        audio.pause();
        audio.currentTime = 0.25;
      });
      await expect
        .poll(() => player.evaluate((audio) => audio.currentTime))
        .toBeGreaterThan(0);
    }
    report.downloads = [];
    for (const [stem, label] of [
      ['vocals', 'Tải vocal WAV'],
      ['instrumental', 'Tải nhạc nền WAV'],
    ]) {
      const waiting = page.waitForEvent('download');
      await page.getByRole('button', { name: label, exact: true }).click();
      const download = await waiting;
      const path = resolve(folder, `${stem}.wav`);
      await download.saveAs(path);
      const validation = await promisify(execFile)(
        config.python,
        [
          '-c',
          'import sys,json; from pathlib import Path; sys.path.insert(0,"ai-worker"); from job_worker import validate_output; print(json.dumps(validate_output(Path(sys.argv[1]),44100)))',
          path,
        ],
        { cwd: ROOT, windowsHide: true, timeout: 30000 },
      );
      report.downloads.push({ stem, ...JSON.parse(validation.stdout) });
    }
    // Presence of fresh worker runtime/metadata proves this is not the UI fixture server.
    report.runtime = JSON.parse(
      await readFile(resolve(config.storage, job.id, 'runtime.json'), 'utf8'),
    );
    const metadata = JSON.parse(
      await readFile(
        resolve(config.storage, job.id, 'output-metadata.json'),
        'utf8',
      ),
    );
    if (
      report.runtime.exit_code !== 0 ||
      metadata.profile.checkpoint_sha256 !== config.profile.checkpoint_sha256
    )
      throw new Error('INVALID_WORKER_EVIDENCE');
    for (const output of report.downloads) {
      const expected = metadata.outputs.find(
        (item) =>
          item.file ===
          (output.stem === 'vocals' ? 'vocals_raw.wav' : 'instrumental.wav'),
      );
      if (!expected || expected.sha256 !== output.sha256)
        throw new Error('INVALID_WORKER_EVIDENCE');
    }
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Bản tách đã sẵn sàng.' }),
    ).toBeVisible({ timeout: 20000 });
    await page.screenshot({
      path: resolve(folder, 'completed.png'),
      fullPage: true,
    });
    report.status = 'PASS';
  }
} catch (error) {
  report.status = 'FAIL';
  const known = [
    'LIVE_SERVERS_REQUIRED',
    'UPLOAD_FAILED',
    'STATUS_FAILED',
    'MEMORY_LIMIT',
    'TIMEOUT',
    'WORKER_INTERRUPTED',
    'WORKER_FAILED',
    'DEMO_TIMEOUT',
    'INVALID_WORKER_EVIDENCE',
  ];
  report.reason = known.includes(error.message)
    ? error.message
    : 'DEMO_CHECK_FAILED';
  process.exitCode = 1;
} finally {
  if (job && !completed && context) {
    try {
      await context.request.delete(
        `http://127.0.0.1:5173/api/v1/jobs/${job.id}`,
        { headers: { Authorization: `Bearer ${job.token}` } },
      );
    } catch {
      report.cleanup = 'CANCEL_REQUEST_FAILED';
    }
  }
  await browser?.close();
  report.elapsedSeconds = (Date.now() - started) / 1000;
  await save();
  console.log(
    `Real browser demo: ${report.status}${report.reason ? ` (${report.reason})` : ''}`,
  );
}
