import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  access,
  readdir,
  rm,
} from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { loadConfig, ROOT } from '../src/config.mjs';
import { JobStore } from '../src/store.mjs';
import { Storage } from '../src/storage.mjs';
import { Scheduler } from '../src/scheduler.mjs';
import { createApp } from '../src/app.mjs';
import { killTree } from '../src/runner.mjs';

const quiet = { info() {}, error() {} };
const waitFor = async (predicate) => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((done) => setTimeout(done, 40));
  }
  throw new Error('Timed out waiting for backend state');
};
// Synthetic PCM is a transport fixture; it does not test separation quality.
function wav(seconds = 1) {
  const frames = 44100 * seconds;
  const buffer = Buffer.alloc(44 + frames * 4);
  buffer.write('RIFF');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(44100, 24);
  buffer.writeUInt32LE(176400, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {
    const value = Math.round(4000 * Math.sin((i * 2 * Math.PI * 440) / 44100));
    buffer.writeInt16LE(value, 44 + i * 4);
    buffer.writeInt16LE(value, 46 + i * 4);
  }
  return buffer;
}

async function setup(t, options = {}) {
  assert.ok(
    process.env.TEST_DATABASE_URL?.includes('/vocal_studio_test_'),
    'Use npm run test:backend',
  );
  const root = await mkdtemp(resolve(ROOT, '.cache/epic3-api-'));
  const config = {
    ...loadConfig({
      ...process.env,
      DATABASE_URL: process.env.TEST_DATABASE_URL,
    }),
    storage: root,
    maxDuration: 30,
    maxUploadBytes: 1024 * 1024,
    minFreeDiskBytes: 0,
    maxPending: 3,
    ...options.config,
  };
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.TEST_DATABASE_URL } },
  });
  await prisma.audioJob.deleteMany();
  const store = new JobStore(prisma),
    storage = new Storage(root);
  const runs = [];
  let running = 0,
    maximum = 0;
  const runner = async (job, signal) => {
    runs.push(job.id);
    running++;
    maximum = Math.max(maximum, running);
    try {
      const folder = storage.folder(job.id);
      await writeFile(
        resolve(folder, 'progress.json'),
        JSON.stringify({ completed_chunks: 1, total_chunks: 2 }),
      );
      await new Promise((done) => {
        const timer = setTimeout(done, options.delay ?? 150);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            done();
          },
          { once: true },
        );
        if (signal.aborted) {
          clearTimeout(timer);
          done();
        }
      });
      if (signal.aborted) return { ok: false, code: 'CANCELLED' };
      if (options.failCode) return { ok: false, code: options.failCode };
      await mkdir(resolve(folder, 'stems'));
      for (const name of ['vocals_raw.wav', 'instrumental.wav'])
        await writeFile(resolve(folder, 'stems', name), wav());
      await writeFile(
        resolve(folder, 'progress.json'),
        JSON.stringify({ completed_chunks: 2, total_chunks: 2 }),
      );
      return { ok: true };
    } finally {
      running--;
    }
  };
  const scheduler = new Scheduler({ store, storage, runner, logger: quiet });
  await scheduler.start();
  const app = createApp({ config, store, storage, scheduler, logger: quiet });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  t.after(async () => {
    await scheduler.stop();
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    await prisma.$disconnect();
    assert.ok(root.startsWith(resolve(ROOT, '.cache/epic3-api-')));
    await rm(root, { recursive: true, force: true });
  });
  const upload = async (
    data = wav(),
    filename = 'song.wav',
    extraHeaders = {},
  ) => {
    const body = new FormData();
    body.append('file', new Blob([data]), filename);
    return fetch(`${base}/jobs`, {
      method: 'POST',
      body,
      headers: extraHeaders,
    });
  };
  const auth = (job) => ({ Authorization: `Bearer ${job.token}` });
  return {
    base,
    upload,
    auth,
    prisma,
    store,
    storage,
    scheduler,
    runs,
    maximum: () => maximum,
  };
}

test('upload → real MySQL queue → worker contract → authenticated Range download', async (t) => {
  const env = await setup(t);
  assert.equal((await fetch(`${env.base}/health`)).status, 200);
  assert.equal((await fetch(`${env.base}/models`)).status, 200);
  const response = await env.upload();
  assert.equal(response.status, 202);
  const job = await response.json();
  assert.match(job.token, /^[a-f0-9]{64}$/);
  assert.equal(
    (await env.store.get(job.id)).tokenHash,
    createHash('sha256').update(job.token).digest('hex'),
  );
  assert.equal((await fetch(`${env.base}/jobs/${job.id}`)).status, 404);
  assert.equal(
    (
      await fetch(`${env.base}/jobs/${job.id}`, {
        headers: { Authorization: `Bearer ${'0'.repeat(64)}` },
      })
    ).status,
    404,
  );
  await waitFor(
    async () => (await env.store.get(job.id)).status === 'COMPLETED',
  );
  const status = await (
    await fetch(`${env.base}/jobs/${job.id}`, { headers: env.auth(job) })
  ).json();
  assert.equal(status.progress, 100);
  assert.equal(status.tokenHash, undefined);
  const range = await fetch(`${env.base}/jobs/${job.id}/preview?stem=vocals`, {
    headers: { ...env.auth(job), Range: 'bytes=0-43' },
  });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 44);
  assert.match(range.headers.get('content-range'), /^bytes 0-43\//);
  const download = await fetch(
    `${env.base}/jobs/${job.id}/download?stem=instrumental`,
    { headers: env.auth(job) },
  );
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition'), /attachment/);
  assert.equal((await download.arrayBuffer()).byteLength, wav().length);
  assert.equal(
    (
      await fetch(`${env.base}/jobs/${job.id}/download?stem=../../.env`, {
        headers: env.auth(job),
      })
    ).status,
    400,
  );
});

test('reject corrupt, oversized, too long and browser cross-origin uploads without leaving files', async (t) => {
  const env = await setup(t, { config: { maxDuration: 1 } });
  assert.equal(
    (await env.upload(Buffer.from('not audio'), 'valid.mp3')).status,
    415,
  );
  assert.equal((await env.upload(Buffer.alloc(1024 * 1024 + 1))).status, 413);
  assert.equal((await env.upload(wav(2))).status, 422);
  assert.equal(
    (
      await env.upload(wav(), 'song.wav', {
        Origin: 'https://unrelated.example',
      })
    ).status,
    403,
  );
  assert.equal(await env.store.countPending(), 0);
  assert.deepEqual(
    (await readdir(env.storage.root)).filter((name) => !name.endsWith('.lock')),
    [],
  );
});

test('one worker, queue capacity and cancel only the selected job', async (t) => {
  const env = await setup(t, { delay: 5000, config: { maxPending: 2 } });
  const first = await (await env.upload()).json();
  await waitFor(() => env.runs.includes(first.id));
  const second = await (await env.upload()).json();
  assert.equal((await env.upload()).status, 429);
  assert.equal(
    (
      await fetch(`${env.base}/jobs/${first.id}/preview?stem=vocals`, {
        headers: env.auth(first),
      })
    ).status,
    409,
  );
  const cancelled = await fetch(`${env.base}/jobs/${first.id}`, {
    method: 'DELETE',
    headers: env.auth(first),
  });
  assert.equal(cancelled.status, 202);
  assert.equal((await env.store.get(first.id)).status, 'CANCELLED');
  await assert.rejects(access(env.storage.folder(first.id)));
  await waitFor(
    async () => (await env.store.get(second.id)).status === 'COMPLETED',
  );
  assert.equal(env.maximum(), 1);
  assert.deepEqual(env.runs, [first.id, second.id]);
});

test('worker timeout contract marks FAILED and removes partial outputs', async (t) => {
  const env = await setup(t, { failCode: 'TIMEOUT' });
  const job = await (await env.upload()).json();
  await waitFor(async () => (await env.store.get(job.id)).status === 'FAILED');
  assert.equal((await env.store.get(job.id)).errorCode, 'TIMEOUT');
  await waitFor(async () => {
    try {
      await access(env.storage.folder(job.id));
      return false;
    } catch {
      return true;
    }
  });
});

test('recovery fails interrupted jobs, retains queue, expiry deletes audio and denies download', async (t) => {
  const env = await setup(t);
  const job = await (await env.upload()).json();
  await waitFor(
    async () => (await env.store.get(job.id)).status === 'COMPLETED',
  );
  await env.prisma.audioJob.update({
    where: { id: job.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await env.scheduler.cleanup();
  assert.equal((await env.store.get(job.id)).status, 'EXPIRED');
  assert.equal(
    (
      await fetch(`${env.base}/jobs/${job.id}/download?stem=vocals`, {
        headers: env.auth(job),
      })
    ).status,
    410,
  );
  await assert.rejects(access(env.storage.folder(job.id)));
  await env.scheduler.stop();
  const queued = await env.store.create({
    id: randomUUID(),
    tokenHash: 'a'.repeat(64),
    originalFilename: 'queued.wav',
    modelId: 'mel-band-roformer-vocal',
    durationSeconds: 1,
    expiresAt: new Date(Date.now() + 3600000),
  });
  await env.prisma.audioJob.update({
    where: { id: job.id },
    data: { status: 'PROCESSING' },
  });
  await env.store.recover();
  assert.equal((await env.store.get(job.id)).errorCode, 'WORKER_INTERRUPTED');
  assert.equal((await env.store.get(job.id)).status, 'FAILED');
  assert.equal((await env.store.get(queued.id)).status, 'QUEUED');
});

test('storage lock prevents a second scheduler from starting', async (t) => {
  const env = await setup(t);
  const other = new Scheduler({
    store: env.store,
    storage: new Storage(resolve(env.storage.root, 'different-storage')),
    runner: async () => {},
    logger: quiet,
  });
  await assert.rejects(other.start(), /Another server/);
  assert.equal(
    await readFile(env.scheduler.lockPath, 'utf8'),
    String(process.pid),
  );
});

test('cancel helper actually terminates the spawned process tree', async (t) => {
  const source =
    "import {spawn} from 'node:child_process'; const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); console.log(child.pid); setInterval(()=>{},1000);";
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  t.after(() => killTree(child));
  const [data] = await once(child.stdout, 'data');
  const descendant = Number(data.toString().trim());
  assert.ok(Number.isSafeInteger(descendant) && descendant > 0);
  await killTree(child);
  await waitFor(() => {
    try {
      process.kill(descendant, 0);
      return false;
    } catch (error) {
      return error.code === 'ESRCH';
    }
  });
});

test('configuration rejects unsafe host, storage and concurrency', () => {
  const env = { DATABASE_URL: 'mysql://test:test@127.0.0.1/test' };
  for (const extra of [
    { HOST: '0.0.0.0' },
    { STORAGE_ROOT: '../outside' },
    { WORKER_CONCURRENCY: '2' },
    { PORT: 'NaN' },
  ]) {
    assert.throws(() => loadConfig({ ...env, ...extra }));
  }
});
