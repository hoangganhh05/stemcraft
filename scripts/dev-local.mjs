import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { ROOT, loadConfig, loadEnv } from '../backend/src/config.mjs';
import { killTree } from '../backend/src/runner.mjs';
import { createServer } from 'node:net';

loadEnv();
const config = loadConfig();
async function available(port) {
  const server = createServer();
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', done);
  });
  await new Promise((done) => server.close(done));
}
try {
  await available(config.port);
  await available(5173);
} catch {
  console.error(
    'Port is already in use. Stop the existing Stemcraft terminal with Ctrl+C, then retry.',
  );
  process.exit(1);
}
const children = [];
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  await Promise.all(children.map(killTree));
  process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    void stop();
  });
for (const args of [
  ['backend/src/server.mjs'],
  ['node_modules/vite/bin/vite.js', '--config', 'frontend/vite.config.mjs'],
]) {
  const child = spawn(
    process.execPath,
    args.map((arg, index) => (index === 0 ? resolve(ROOT, arg) : arg)),
    { cwd: ROOT, windowsHide: true, stdio: 'inherit' },
  );
  children.push(child);
  child.once('error', () => {
    void stop(1);
  });
  child.once('close', (code) => {
    if (!stopping) void stop(code || 1);
  });
}
console.log(
  'Stemcraft: http://127.0.0.1:5173 — Ctrl+C stops both project servers.',
);
