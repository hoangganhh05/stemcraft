import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

test('repository contains foundation setup and reproducible dependency manifests', () => {
  for (const path of [
    'frontend',
    'backend',
    'ai-worker',
    'config',
    'docs',
    'samples',
    'results',
    'storage',
    '.env.example',
    'ai-worker/requirements.lock.txt',
    'package-lock.json',
    'docs/ADR-001-benchmark-gate.md',
  ]) {
    assert.ok(existsSync(path), `Missing ${path}`);
  }
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const name of ['eslint', '@eslint/js', 'globals', 'prettier']) {
    assert.match(
      pkg.devDependencies[name],
      /^\d+\.\d+\.\d+$/,
      `${name} must use exact version`,
    );
  }
});

test('private audio, weights, local environments and secrets are ignored by Git', () => {
  const paths = [
    '.env',
    '.env.local',
    'samples/private.wav',
    'results/private.wav',
    'storage/input.mp3',
    'models/checkpoint.ckpt',
    '.venv/private.txt',
    '.tools/private.exe',
    '.cache/private.txt',
    'node_modules/private.js',
  ];
  const ignored = execFileSync('git', ['check-ignore', '--stdin'], {
    input: paths.join('\n') + '\n',
    encoding: 'utf8',
    windowsHide: true,
  })
    .trim()
    .split(/\r?\n/);
  assert.deepEqual(ignored, paths);
  assert.equal(
    execFileSync(
      'git',
      ['check-ignore', '--non-matching', '--verbose', '.env.example'],
      { encoding: 'utf8', windowsHide: true },
    ).includes('!.env.example'),
    true,
  );
});
