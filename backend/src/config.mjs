import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute } from 'node:path';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export function inside(parent, child) {
  const part = relative(parent, child);
  return part !== '' && !part.startsWith('..') && !isAbsolute(part);
}

export function loadEnv() {
  const path = resolve(ROOT, '.env');
  if (existsSync(path)) process.loadEnvFile(path);
}

export function loadConfig(env = process.env) {
  const integer = (key, fallback, minimum, maximum) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new Error(`Invalid configuration: ${key}`);
    }
    return value;
  };
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required in .env');
  let database;
  try {
    database = new URL(env.DATABASE_URL);
  } catch {
    throw new Error('Invalid DATABASE_URL');
  }
  if (database.protocol !== 'mysql:')
    throw new Error('DATABASE_URL must use mysql');
  const host = env.HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '::1'].includes(host))
    throw new Error('This development server binds to loopback only');
  if (integer('WORKER_CONCURRENCY', 1, 1, 1) !== 1)
    throw new Error('Only one worker is supported');
  const storage = resolve(ROOT, env.STORAGE_ROOT ?? 'storage');
  if (
    !inside(ROOT, storage) ||
    !['storage', '.cache'].includes(relative(ROOT, storage).split(/[\\/]/)[0])
  ) {
    throw new Error('STORAGE_ROOT must stay in project storage or .cache');
  }
  const ffmpegDir = resolve(
    ROOT,
    '.tools/ffmpeg/ffmpeg-9.0.2-essentials_build/bin',
  );
  const tool = (name) =>
    env[name.toUpperCase() + '_PATH'] ??
    (existsSync(resolve(ffmpegDir, `${name}.exe`))
      ? resolve(ffmpegDir, `${name}.exe`)
      : name);
  return {
    host,
    port: integer('PORT', 3000, 1, 65535),
    storage,
    databaseUrl: env.DATABASE_URL,
    python: resolve(ROOT, env.PYTHON_PATH ?? '.venv/Scripts/python.exe'),
    ffmpeg: tool('ffmpeg'),
    ffprobe: tool('ffprobe'),
    ttlHours: integer('JOB_TTL_HOURS', 24, 1, 168),
    maxUploadBytes: integer('MAX_UPLOAD_MB', 50, 1, 200) * 1024 ** 2,
    maxDuration: integer('MAX_DURATION_SECONDS', 600, 1, 600),
    maxPending: integer('MAX_PENDING_JOBS', 3, 1, 10),
    timeoutSeconds: integer('JOB_TIMEOUT_SECONDS', 43200, 30, 43200),
    memoryLimitMiB: integer('WORKER_MEMORY_MIB', 3500, 512, 3500),
    minFreeDiskBytes: integer('MIN_FREE_DISK_MB', 2048, 128, 65536) * 1024 ** 2,
    profile: JSON.parse(
      readFileSync(resolve(ROOT, 'config/ai-profile.json'), 'utf8'),
    ),
  };
}
