import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT } from '../backend/src/config.mjs';

// Sequential suites avoid competing for this machine's limited memory.
// npm is installed with Node, not within project node_modules.
const npm =
  process.platform === 'win32'
    ? resolve(process.execPath, '../node_modules/npm/bin/npm-cli.js')
    : null;
const npmRun = (name) =>
  npm ? [process.execPath, [npm, 'run', name]] : ['npm', ['run', name]];
const plan = [
  ['checks', ...npmRun('check')],
  ['api', ...npmRun('test:backend')],
  [
    'worker',
    resolve(ROOT, '.venv/Scripts/python.exe'),
    [
      '-m',
      'unittest',
      'discover',
      '-s',
      'ai-worker',
      '-p',
      'test_job_worker.py',
      '-v',
    ],
  ],
  [
    'wav',
    resolve(ROOT, '.venv/Scripts/python.exe'),
    [
      '-m',
      'unittest',
      'discover',
      '-s',
      'ai-worker',
      '-p',
      'test_audio_output.py',
      '-v',
    ],
  ],
  ['frontend', ...npmRun('test:frontend')],
  ['build', ...npmRun('build:frontend')],
];
const report = {
  startedAt: new Date().toISOString(),
  scope:
    'Local regression with synthetic fixtures; no model inference or GPU benchmark',
  suites: [],
};
for (const [name, command, args] of plan) {
  const started = performance.now();
  console.log(`Running ${name}`);
  const result = await new Promise((done) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      windowsHide: true,
      stdio: 'inherit',
    });
    child.once('error', () => done({ status: 'FAIL', code: 'SPAWN_FAILED' }));
    child.once('close', (code) =>
      done({ status: code === 0 ? 'PASS' : 'FAIL', exitCode: code }),
    );
  });
  report.suites.push({
    name,
    ...result,
    elapsedSeconds: Math.round((performance.now() - started) / 10) / 100,
  });
  if (result.status !== 'PASS') break;
}
report.status =
  report.suites.length === plan.length &&
  report.suites.every((item) => item.status === 'PASS')
    ? 'PASS'
    : 'FAIL';
report.finishedAt = new Date().toISOString();
await mkdir(resolve(ROOT, 'docs/reports'), { recursive: true });
await writeFile(
  resolve(ROOT, 'docs/reports/epic-05-regression.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
if (report.status !== 'PASS') process.exitCode = 1;
