import { PrismaClient } from '@prisma/client';
import { loadEnv, loadConfig } from '../backend/src/config.mjs';

loadEnv();
const config = loadConfig();
const url = new URL(config.databaseUrl);
if (
  !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
  url.pathname !== '/vocal_studio_dev'
) {
  throw new Error('This command only initializes local vocal_studio_dev');
}
url.pathname = '/mysql';
const client = new PrismaClient({
  datasources: { db: { url: url.toString() } },
});
try {
  await client.$executeRawUnsafe(
    'CREATE DATABASE IF NOT EXISTS `vocal_studio_dev` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  );
  console.log(
    'Local development database ready. No existing database was dropped.',
  );
} catch (error) {
  console.error(
    `Database initialization failed (${error.errorCode ?? error.code ?? error.name ?? 'CONNECTION_ERROR'}). Check local .env.`,
  );
  process.exitCode = 1;
} finally {
  await client.$disconnect();
}
