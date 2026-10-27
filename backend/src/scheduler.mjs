import { mkdir, readFile, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT } from './config.mjs';

export class Scheduler {
  constructor({ store, storage, runner, logger = console }) {
    Object.assign(this, { store, storage, runner, logger });
    this.active = null;
    this.busy = false;
    this.stopped = true;
  }
  async start() {
    await this.storage.init();
    await mkdir(this.storage.root, { recursive: true });
    await mkdir(resolve(ROOT, '.cache'), { recursive: true });
    this.lockPath = resolve(ROOT, '.cache/backend-server.lock');
    try {
      this.lock = await open(this.lockPath, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const previous = Number(await readFile(this.lockPath, 'utf8'));
      if (!Number.isSafeInteger(previous) || previous <= 0)
        throw new Error(
          'Invalid server lock; inspect .cache/backend-server.lock',
          {
            cause: error,
          },
        );
      try {
        process.kill(previous, 0);
        throw new Error('Another server already owns this storage', {
          cause: error,
        });
      } catch (check) {
        if (check.code !== 'ESRCH') throw check;
      }
      await unlink(this.lockPath);
      this.lock = await open(this.lockPath, 'wx');
    }
    await this.lock.writeFile(String(process.pid));
    try {
      await this.store.recover();
      await this.storage.cleanOrphans(await this.store.all());
      this.stopped = false;
      await this.cleanup();
      this.timer = setInterval(() => {
        void this.tick();
      }, 1000);
      this.cleanTimer = setInterval(() => {
        void this.cleanup().catch(() => this.logger.error('cleanup_failed'));
      }, 60000);
      void this.tick();
    } catch (error) {
      await this.releaseLock();
      throw error;
    }
  }
  async tick() {
    if (this.stopped || this.busy || this.active) return;
    this.busy = true;
    try {
      const job = await this.store.claim();
      if (!job) return;
      if (this.stopped) {
        await this.store.updateProcessing(job.id, {
          status: 'FAILED',
          errorCode: 'WORKER_INTERRUPTED',
          finishedAt: new Date(),
        });
        return;
      }
      if (new Date(job.expiresAt).getTime() <= Date.now()) {
        await this.store.updateProcessing(job.id, { status: 'EXPIRED' });
        await this.storage.remove(job.id);
        return;
      }
      const controller = new AbortController();
      const active = { id: job.id, controller };
      this.active = active;
      active.done = this.process(job, controller.signal).finally(() => {
        if (this.active === active) this.active = null;
      });
      await active.done;
    } catch {
      this.logger.error('queue_tick_failed');
    } finally {
      this.busy = false;
    }
  }
  async process(job, signal) {
    const update = setInterval(() => {
      void this.syncProgress(job.id).catch(() => {});
    }, 2000);
    try {
      const result = await this.runner(job, signal);
      if (result.ok) {
        await this.storage.result(job.id, 'vocals');
        await this.storage.result(job.id, 'instrumental');
        await this.syncProgress(job.id);
        await this.store.updateProcessing(job.id, {
          status: 'COMPLETED',
          progress: 100,
          finishedAt: new Date(),
        });
      } else {
        await this.store.updateProcessing(job.id, {
          status: 'FAILED',
          errorCode: result.code,
          finishedAt: new Date(),
        });
        if (!signal.aborted) await this.storage.captureFailure(job.id);
        await this.storage.remove(job.id, signal.aborted);
      }
    } catch {
      await this.store.updateProcessing(job.id, {
        status: 'FAILED',
        errorCode: 'WORKER_FAILED',
        finishedAt: new Date(),
      });
      if (!signal.aborted) await this.storage.captureFailure(job.id);
      await this.storage.remove(job.id, signal.aborted);
    } finally {
      clearInterval(update);
      this.logger.info(
        JSON.stringify({ jobId: job.id, event: 'worker_finished' }),
      );
    }
  }
  async syncProgress(id) {
    const value = await this.storage.progress(id);
    if (
      !value ||
      !Number.isSafeInteger(value.total_chunks) ||
      !Number.isSafeInteger(value.completed_chunks) ||
      value.total_chunks <= 0 ||
      value.completed_chunks < 0 ||
      value.completed_chunks > value.total_chunks
    )
      return;
    await this.store.updateProcessing(id, {
      completedChunks: value.completed_chunks,
      totalChunks: value.total_chunks,
      progress: Math.min(
        99,
        Math.floor((value.completed_chunks / value.total_chunks) * 99),
      ),
    });
  }
  async cancel(id) {
    await this.store.cancel(id);
    const active = this.active;
    if (active?.id === id) {
      active.controller.abort();
      await active.done;
    }
    await this.storage.remove(id);
  }
  async cleanup() {
    for (const job of await this.store.expired(new Date())) {
      const changed = await this.store.expire(job.id);
      if (changed.count) await this.storage.remove(job.id);
    }
  }
  async releaseLock() {
    if (!this.lock) return;
    await this.lock.close();
    this.lock = null;
    await unlink(this.lockPath);
  }
  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    clearInterval(this.cleanTimer);
    while (this.busy && !this.active)
      await new Promise((done) => setTimeout(done, 10));
    if (this.active) {
      this.active.controller.abort();
      await this.active.done;
    }
    await this.releaseLock();
  }
}
