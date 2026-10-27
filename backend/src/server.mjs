import { PrismaClient } from '@prisma/client';
import { loadConfig, loadEnv } from './config.mjs';
import { Storage } from './storage.mjs';
import { JobStore } from './store.mjs';
import { makeRunner } from './runner.mjs';
import { Scheduler } from './scheduler.mjs';
import { createApp } from './app.mjs';
import { preflight } from './preflight.mjs';

loadEnv();
let prisma, scheduler, server;
let closing = false;
try {
  const config = loadConfig();
  await preflight(config);
  prisma = new PrismaClient({
    datasources: { db: { url: config.databaseUrl } },
  });
  await prisma.$connect();
  const store = new JobStore(prisma);
  const storage = new Storage(config.storage);
  scheduler = new Scheduler({
    store,
    storage,
    runner: makeRunner(config, storage),
  });
  await scheduler.start();
  const app = createApp({ config, store, storage, scheduler });
  server = app.listen(config.port, config.host, () =>
    console.log(`Backend ready at http://${config.host}:${config.port}`),
  );
  server.on('error', () => {
    console.error('Server could not bind configured port');
    void shutdown(1);
  });
} catch {
  console.error(
    'Backend startup failed. Check .env, MySQL migration and storage access. Credentials are not logged.',
  );
  await shutdown(1);
}

async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  const drained = server
    ? new Promise((done) => server.close(done))
    : Promise.resolve();
  await scheduler?.stop().catch(() => {});
  server?.closeAllConnections();
  await drained;
  await prisma?.$disconnect();
  process.exitCode = code;
}
process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
