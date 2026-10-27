import { PrismaClient } from '@prisma/client';
import { mkdtemp, writeFile, readFile, copyFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { loadConfig, loadEnv, ROOT } from '../backend/src/config.mjs';
import { Storage } from '../backend/src/storage.mjs';
import { JobStore } from '../backend/src/store.mjs';
import { makeRunner } from '../backend/src/runner.mjs';
import { Scheduler } from '../backend/src/scheduler.mjs';
import { createApp } from '../backend/src/app.mjs';
import { preflight } from '../backend/src/preflight.mjs';

if (!process.argv.includes('--run'))
  throw new Error(
    'Use --run to opt into one real AI integration job (may take several minutes)',
  );
loadEnv();
const reportPath = resolve(ROOT, 'docs/reports/epic-03-real-ai.json');
try {
  await copyFile(
    reportPath,
    resolve(ROOT, `docs/reports/epic-03-real-ai-attempt-${Date.now()}.json`),
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const config = loadConfig();
config.storage = await mkdtemp(resolve(ROOT, '.cache/epic3-real-ai-'));
config.timeoutSeconds = 1800;
const prisma = new PrismaClient({
  datasources: { db: { url: config.databaseUrl } },
});
const store = new JobStore(prisma),
  storage = new Storage(config.storage);
const scheduler = new Scheduler({
  store,
  storage,
  runner: makeRunner(config, storage),
});
let server, job;
const started = Date.now();
const report = {
  status: 'RUNNING',
  scope: 'One-second technical integration, not quality evaluation',
  profileId: config.profile.id,
};
try {
  await preflight(config);
  await prisma.$connect();
  await scheduler.start();
  const fixture = resolve(config.storage, 'fixture.wav');
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
      '-ac',
      '2',
      '-ar',
      '44100',
      '-c:a',
      'pcm_s16le',
      fixture,
    ],
    { windowsHide: true, timeout: 30000 },
  );
  server = createApp({ config, store, storage, scheduler }).listen(
    0,
    '127.0.0.1',
  );
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const body = new FormData();
  body.append(
    'file',
    new Blob([await readFile(fixture)]),
    'technical-one-second.wav',
  );
  const accepted = await fetch(`${base}/jobs`, { method: 'POST', body });
  if (accepted.status !== 202)
    throw new Error(`Upload failed with HTTP ${accepted.status}`);
  job = await accepted.json();
  const headers = { Authorization: `Bearer ${job.token}` };
  report.jobId = job.id;
  console.log(`Real integration job started: ${job.id}. Token is not logged.`);
  const deadline = Date.now() + (config.timeoutSeconds + 120) * 1000;
  let last = '';
  while (Date.now() < deadline) {
    const current = await (
      await fetch(`${base}/jobs/${job.id}`, { headers })
    ).json();
    const state = `${current.status}:${current.completedChunks}/${current.totalChunks}`;
    if (state !== last) {
      console.log(state);
      last = state;
    }
    if (current.status === 'FAILED')
      throw new Error(`Worker failed: ${current.errorCode}`);
    if (current.status === 'COMPLETED') {
      for (const stem of ['vocals', 'instrumental']) {
        const download = await fetch(
          `${base}/jobs/${job.id}/download?stem=${stem}`,
          { headers },
        );
        if (
          download.status !== 200 ||
          (await download.arrayBuffer()).byteLength < 44
        )
          throw new Error('Invalid WAV download');
      }
      const range = await fetch(`${base}/jobs/${job.id}/preview?stem=vocals`, {
        headers: { ...headers, Range: 'bytes=0-43' },
      });
      if (range.status !== 206 || (await range.arrayBuffer()).byteLength !== 44)
        throw new Error('Range preview failed');
      report.status = 'PASS';
      report.runtime = JSON.parse(
        await readFile(resolve(storage.folder(job.id), 'runtime.json'), 'utf8'),
      );
      report.outputMetadata = JSON.parse(
        await readFile(
          resolve(storage.folder(job.id), 'output-metadata.json'),
          'utf8',
        ),
      );
      report.resultDirectory = relative(ROOT, storage.folder(job.id));
      break;
    }
    await new Promise((done) => setTimeout(done, 3000));
  }
  if (report.status !== 'PASS')
    throw new Error('Integration deadline exceeded');
} catch (error) {
  report.status = 'FAILED';
  report.error = error.message;
  console.error('Real AI integration failed; see technical report.');
  process.exitCode = 1;
} finally {
  await scheduler.stop();
  server?.closeAllConnections();
  if (server) await new Promise((done) => server.close(done));
  await prisma.$disconnect();
  report.elapsedSeconds = (Date.now() - started) / 1000;
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`Integration result: ${report.status}`);
}
