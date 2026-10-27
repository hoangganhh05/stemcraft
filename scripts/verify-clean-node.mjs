import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { ROOT } from '../backend/src/config.mjs';
const clean = resolve(ROOT, '.cache/epic6-clean-node-20261027');
const report = {
  generatedAt: new Date().toISOString(),
  scope:
    'Fresh Node installation on the same Windows host, offline cache, npm ci --ignore-scripts; not a different machine or full setup',
  checks: [],
};
try {
  const rootLock = await readFile(resolve(ROOT, 'package-lock.json'));
  assert.deepEqual(
    await readFile(resolve(clean, 'package-lock.json')),
    rootLock,
  );
  const installed = JSON.parse(
    await readFile(resolve(clean, 'node_modules/.package-lock.json'), 'utf8'),
  );
  const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'));
  for (const [name, expected] of Object.entries({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  })) {
    const value = JSON.parse(
      await readFile(
        resolve(clean, 'node_modules', name, 'package.json'),
        'utf8',
      ),
    );
    assert.equal(value.version, expected);
    assert.equal(installed.packages[`node_modules/${name}`].version, expected);
    report.checks.push({ name, version: value.version, status: 'PASS' });
  }
  report.lockSha256 = createHash('sha256').update(rootLock).digest('hex');
  report.status = 'PASS';
} catch {
  report.status = 'FAIL';
  process.exitCode = 1;
}
await writeFile(
  resolve(ROOT, 'docs/reports/epic-06-clean-node.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(`Clean Node verification: ${report.status}`);
