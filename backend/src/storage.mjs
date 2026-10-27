import {
  mkdir,
  realpath,
  lstat,
  rm,
  readdir,
  stat,
  statfs,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { inside } from './config.mjs';

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class Storage {
  constructor(root) {
    this.root = root;
  }
  async init() {
    await mkdir(this.root, { recursive: true });
    if (
      (await lstat(this.root)).isSymbolicLink() ||
      (await realpath(this.root)).toLowerCase() !==
        resolve(this.root).toLowerCase()
    )
      throw new Error('Storage must not contain symlinks');
  }
  folder(id) {
    if (!UUID.test(id)) throw new Error('Invalid job id');
    const folder = resolve(this.root, id);
    if (!inside(this.root, folder)) throw new Error('Invalid storage path');
    return folder;
  }
  async safeFolder(id) {
    const folder = this.folder(id);
    try {
      if (
        (await lstat(folder)).isSymbolicLink() ||
        (await realpath(folder)).toLowerCase() !== folder.toLowerCase()
      )
        throw new Error('Unsafe job path');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return folder;
  }
  async remove(id, removeDiagnostics = true) {
    const folder = await this.safeFolder(id);
    await rm(folder, { recursive: true, force: true });
    if (removeDiagnostics) {
      const diagnostics = resolve(this.root, 'diagnostics', id);
      try {
        const actual = await realpath(diagnostics);
        if (
          !inside(this.root, actual) ||
          actual.toLowerCase() !== diagnostics.toLowerCase()
        )
          throw new Error('Unsafe diagnostics path');
        await rm(diagnostics, { recursive: true, force: true });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  async captureFailure(id) {
    const folder = await this.safeFolder(id);
    const target = resolve(this.root, 'diagnostics', id);
    await mkdir(target, { recursive: true });
    if ((await realpath(target)).toLowerCase() !== target.toLowerCase())
      throw new Error('Unsafe diagnostics path');
    for (const name of ['runtime.json', 'progress.json', 'worker.log']) {
      try {
        const source = resolve(folder, name);
        if ((await lstat(source)).isSymbolicLink()) continue;
        const data = await readFile(source);
        await writeFile(resolve(target, name), data.subarray(0, 1024 * 1024));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  async result(id, stem) {
    const filename = {
      vocals: 'vocals_raw.wav',
      instrumental: 'instrumental.wav',
    }[stem];
    if (!filename) return null;
    const folder = await this.safeFolder(id);
    const path = resolve(folder, 'stems', filename);
    const actual = await realpath(path);
    if (
      !inside(folder, actual) ||
      actual.toLowerCase() !== path.toLowerCase() ||
      !(await stat(path)).isFile()
    )
      throw new Error('Unsafe result');
    return path;
  }
  async progress(id) {
    try {
      return JSON.parse(
        await readFile(
          resolve(await this.safeFolder(id), 'progress.json'),
          'utf8',
        ),
      );
    } catch (error) {
      if (
        ['ENOENT', 'EPERM', 'EBUSY'].includes(error.code) ||
        error instanceof SyntaxError
      )
        return null;
      throw error;
    }
  }
  async freeBytes() {
    const data = await statfs(this.root);
    return data.bavail * data.bsize;
  }
  async cleanOrphans(jobs) {
    const known = new Map(jobs.map((job) => [job.id, job.status]));
    for (const item of await readdir(this.root, { withFileTypes: true })) {
      if (!UUID.test(item.name) || !item.isDirectory()) continue;
      const state = known.get(item.name);
      if (
        ['FAILED', 'CANCELLED', 'EXPIRED'].includes(state) ||
        (!state &&
          Date.now() - (await stat(this.folder(item.name))).mtimeMs > 3600000)
      )
        await this.remove(item.name);
    }
  }
}
