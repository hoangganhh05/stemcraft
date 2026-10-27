import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

function probe(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
  });
  return {
    state: result.error
      ? result.error.code === 'ENOENT'
        ? 'not_found'
        : 'probe_blocked'
      : result.status === 0
        ? 'available'
        : 'command_failed',
    available: !result.error && result.status === 0,
    exitCode: result.status,
    details: (result.error?.message || result.stdout || result.stderr || '')
      .trim()
      .slice(0, 3000),
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  platform: os.platform(),
  architecture: os.arch(),
  cpu: os.cpus()[0]?.model ?? 'unknown',
  logicalProcessors: os.availableParallelism(),
  totalRamGiB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
  freeRamGiB: Math.round((os.freemem() / 1024 ** 3) * 10) / 10,
  node: process.version,
  tools: {
    python: probe('python', ['--version']),
    pythonLauncher: probe('py', ['--version']),
    ffmpeg: probe('ffmpeg', ['-version']),
    ffprobe: probe('ffprobe', ['-version']),
    nvidia: probe('nvidia-smi', [
      '--query-gpu=name,memory.total,driver_version',
      '--format=csv,noheader',
    ]),
    git: probe('git', ['--version']),
  },
};
report.readyForPythonCheck =
  (report.tools.python.available || report.tools.pythonLauncher.available) &&
  report.tools.ffmpeg.available &&
  report.tools.ffprobe.available;
mkdirSync('docs/reports', { recursive: true });
writeFileSync(
  'docs/reports/environment.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
if (!report.readyForPythonCheck) process.exitCode = 1;
