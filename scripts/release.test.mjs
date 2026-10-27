import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectReleaseFile } from './audit-release.mjs';

test('release audit blocks private artifacts and real-looking credentials without returning values', () => {
  for (const path of [
    '.env',
    'backend/.env.local',
    'models/weights.ckpt',
    'samples/private.wav',
    'storage/private.json',
    'frontend/dist/index.html',
    'node_modules/pkg/index.js',
  ])
    assert.ok(inspectReleaseFile(path).includes('PRIVATE_ARTIFACT'));
  const token = 'gh' + 'p_' + 'a'.repeat(36);
  assert.deepEqual(inspectReleaseFile('example.txt', token), ['ACCESS_KEY']);
  const credential = ['mysql://user:', 'private-value', '@localhost/db'].join(
    '',
  );
  assert.deepEqual(inspectReleaseFile('example.txt', credential), [
    'DATABASE_CREDENTIAL',
  ]);
  assert.deepEqual(
    inspectReleaseFile('example.txt', '-----BEGIN ' + 'PRIVATE KEY-----'),
    ['PRIVATE_KEY'],
  );
});

test('release audit accepts public configuration templates and source paths', () => {
  assert.deepEqual(
    inspectReleaseFile(
      '.env.example',
      'DATABASE_URL=mysql://vocal:CHANGE_ME@127.0.0.1:3306/vocal_studio_dev',
    ),
    [],
  );
  assert.deepEqual(
    inspectReleaseFile('frontend/src/App.jsx', 'const token = response.token;'),
    [],
  );
  assert.deepEqual(
    inspectReleaseFile('frontend/public/favicon.svg', '<svg/>'),
    [],
  );
});

test('local launcher rejects an occupied backend port without starting servers', async () => {
  const { createServer } = await import('node:net');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const server = createServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    await assert.rejects(
      promisify(execFile)(process.execPath, ['scripts/dev-local.mjs'], {
        env: { ...process.env, PORT: String(server.address().port) },
        windowsHide: true,
        timeout: 15000,
      }),
      (error) =>
        error.code === 1 && error.stderr.includes('Port is already in use'),
    );
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test('readiness cannot accept missing, blocked or mismatched real AI evidence', async () => {
  const { assessRelease } = await import('./release-readiness.mjs');
  const pass = { status: 'PASS' };
  const evidence = {
    audit: pass,
    qa: pass,
    doctor: pass,
    clean: pass,
    profile: { id: 'current' },
  };
  for (const demo of [
    undefined,
    { status: 'BLOCKED' },
    { status: 'FAIL' },
    { status: 'PASS', profileId: 'old' },
  ]) {
    const result = assessRelease({ ...evidence, demo });
    assert.equal(result.localDecision, 'NOT_ACCEPTED');
    assert.equal(result.publicDecision, 'NO_GO');
  }
  const result = assessRelease({
    ...evidence,
    demo: { status: 'PASS', profileId: 'current' },
  });
  assert.equal(result.localDecision, 'GO_SHORT_CLIPS_CURRENT_HOST');
  assert.equal(result.publicDecision, 'NO_GO');
  assert.equal(
    assessRelease({
      ...evidence,
      audit: { status: 'FAIL' },
      demo: { status: 'PASS', profileId: 'current' },
    }).localDecision,
    'NOT_ACCEPTED',
  );
});
