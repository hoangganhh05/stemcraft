import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { loadEnv, loadConfig, ROOT } from '../backend/src/config.mjs';

loadEnv();
const config = loadConfig();
const url = new URL(config.databaseUrl);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
  throw new Error('Tests require local MySQL');
const database = `vocal_studio_test_${randomBytes(6).toString('hex')}`;
if (!/^vocal_studio_test_[0-9a-f]{12}$/.test(database))
  throw new Error('Invalid test database');
const adminUrl = new URL(url);
adminUrl.pathname = '/mysql';
const admin = new PrismaClient({
  datasources: { db: { url: adminUrl.toString() } },
});
url.pathname = `/${database}`;
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  TEST_DATABASE_URL: url.toString(),
};
const run = (args) =>
  new Promise((done, fail) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env,
      windowsHide: true,
      stdio: 'inherit',
    });
    child.once('error', fail);
    child.once('close', (code) =>
      code === 0 ? done() : fail(new Error('Backend test command failed')),
    );
  });
let created = false;
try {
  await admin.$executeRawUnsafe(
    `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  created = true;
  await run([
    resolve(ROOT, 'node_modules/prisma/build/index.js'),
    'migrate',
    'deploy',
    '--schema',
    'backend/prisma/schema.prisma',
  ]);
  // Second deploy verifies repeatability instead of assuming it.
  await run([
    resolve(ROOT, 'node_modules/prisma/build/index.js'),
    'migrate',
    'deploy',
    '--schema',
    'backend/prisma/schema.prisma',
  ]);
  await run(['--test', '--test-concurrency=1', 'backend/test/api.test.mjs']);
} catch (error) {
  console.error(
    `Backend checks failed (${error.errorCode ?? error.code ?? 'CHECK_FAILED'}). Credentials are not logged.`,
  );
  process.exitCode = 1;
} finally {
  if (created) await admin.$executeRawUnsafe(`DROP DATABASE \`${database}\``);
  await admin.$disconnect();
}
