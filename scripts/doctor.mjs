import { PrismaClient } from '@prisma/client';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { freemem } from 'node:os';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig, loadEnv, ROOT } from '../backend/src/config.mjs';
import { preflight } from '../backend/src/preflight.mjs';

loadEnv();
const report = {
  generatedAt: new Date().toISOString(),
  checks: [],
  warnings: [],
  scope:
    'Local prerequisites only; no inference, package installation or database migration',
};
let config;
async function check(name, action) {
  try {
    await action();
    report.checks.push({ name, status: 'PASS' });
  } catch {
    report.checks.push({ name, status: 'FAIL' });
  }
}
await check('configuration', async () => {
  config = loadConfig();
});
if (config) {
  await check('python_ffmpeg_model_hashes', () => preflight(config));
  await check('python_dependencies', () =>
    promisify(execFile)(
      config.python,
      [
        '-c',
        'import torch, soundfile, psutil; from audio_separator.separator import Separator',
      ],
      { cwd: ROOT, timeout: 120000, windowsHide: true },
    ),
  );
  await check('mysql_schema', async () => {
    const prisma = new PrismaClient({
      datasources: { db: { url: config.databaseUrl } },
    });
    try {
      await prisma.audioJob.count();
    } finally {
      await prisma.$disconnect();
    }
  });
}
report.freeRamMiB = Math.round(freemem() / 1024 ** 2);
if (report.freeRamMiB < 1024) report.warnings.push('LOW_AVAILABLE_RAM');
report.warnings.push(
  'CPU_PROFILE_SLOW_FOR_FULL_TRACKS',
  'WEIGHTS_LICENSE_UNVERIFIED',
);
report.status = report.checks.every((item) => item.status === 'PASS')
  ? 'PASS'
  : 'FAIL';
await writeFile(
  resolve(ROOT, 'docs/reports/epic-06-doctor.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
for (const item of report.checks) console.log(`${item.name}: ${item.status}`);
console.log(
  `Free RAM: ${report.freeRamMiB} MiB; ${report.warnings.join(', ')}`,
);
if (report.status !== 'PASS') process.exitCode = 1;
