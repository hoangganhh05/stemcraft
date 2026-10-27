import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { ROOT } from './config.mjs';

export async function killTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise((done) => {
      const killer = spawn(
        'taskkill.exe',
        ['/PID', String(child.pid), '/T', '/F'],
        { windowsHide: true, stdio: 'ignore' },
      );
      killer.on('error', done);
      killer.on('close', done);
    });
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

export function makeRunner(config, storage) {
  return async (job, signal) => {
    if (signal.aborted) return { ok: false, code: 'CANCELLED' };
    const folder = await storage.safeFolder(job.id);
    const log = createWriteStream(resolve(folder, 'worker.log'), {
      flags: 'a',
    });
    const logClosed = new Promise((done) => log.once('close', done));
    const child = spawn(
      config.python,
      [
        resolve(ROOT, 'ai-worker/job_worker.py'),
        '--job-dir',
        folder,
        '--owner-pid',
        String(process.pid),
        '--timeout',
        String(config.timeoutSeconds),
        '--memory-mib',
        String(config.memoryLimitMiB),
        '--max-duration',
        String(config.maxDuration),
      ],
      {
        cwd: ROOT,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          FFMPEG_BINARY: config.ffmpeg,
          FFPROBE_BINARY: config.ffprobe,
          PATH: isAbsolute(config.ffmpeg)
            ? `${dirname(config.ffmpeg)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`
            : process.env.PATH,
        },
      },
    );
    let written = 0;
    const output = (data) => {
      const available = Math.max(0, 1024 * 1024 - written);
      if (available) {
        log.write(data.subarray(0, available));
        written += Math.min(available, data.length);
      }
    };
    child.stdout.on('data', output);
    child.stderr.on('data', output);
    log.on('error', () => {
      void killTree(child);
    });
    const cancel = () => {
      void killTree(child);
    };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    const timer = setTimeout(cancel, (config.timeoutSeconds + 60) * 1000);
    let code;
    try {
      code = await new Promise((done) => {
        child.once('error', () => done(-1));
        child.once('close', (value) => done(value));
      });
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      log.end();
      await logClosed;
    }
    const progress = await storage.progress(job.id);
    return {
      ok: code === 0 && progress?.stage === 'COMPLETED',
      code: signal.aborted
        ? 'CANCELLED'
        : (progress?.error_code ?? 'WORKER_FAILED'),
    };
  };
}
