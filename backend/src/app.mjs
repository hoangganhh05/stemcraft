import express from 'express';
import multer from 'multer';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import {
  randomUUID,
  randomBytes,
  createHash,
  timingSafeEqual,
} from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { HttpError, probeAudio } from './probe.mjs';
import { UUID } from './storage.mjs';

const hash = (token) => createHash('sha256').update(token).digest();
const safeJob = (job) => ({
  id: job.id,
  originalFilename: job.originalFilename,
  modelId: job.modelId,
  status: job.status,
  progress: job.progress,
  completedChunks: job.completedChunks,
  totalChunks: job.totalChunks,
  durationSeconds: job.durationSeconds,
  errorCode: job.errorCode,
  createdAt: job.createdAt,
  startedAt: job.startedAt,
  finishedAt: job.finishedAt,
  expiresAt: job.expiresAt,
});

export function createApp({
  config,
  store,
  storage,
  scheduler,
  logger = console,
  probe = probeAudio,
}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(helmet());
  app.use((req, _res, next) => {
    const origin = req.get('origin');
    const allowed = [
      `http://127.0.0.1:${config.port}`,
      `http://localhost:${config.port}`,
      'http://127.0.0.1:5173',
      'http://localhost:5173',
    ];
    if (origin && !allowed.includes(origin))
      throw new HttpError(403, 'ORIGIN_NOT_ALLOWED');
    next();
  });
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader('X-Request-ID', req.requestId);
    res.setHeader('Cache-Control', 'no-store');
    const started = Date.now();
    res.once('finish', () =>
      logger.info(
        JSON.stringify({
          requestId: req.requestId,
          method: req.method,
          status: res.statusCode,
          elapsedMs: Date.now() - started,
        }),
      ),
    );
    next();
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 180,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'RATE_LIMITED' },
    }),
  );
  app.get('/api/v1/health', async (_req, res) => {
    try {
      await store.countPending();
      res.json({ status: 'ok', scope: 'local_development' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  app.get('/api/v1/models', (_req, res) =>
    res.json({
      scope: 'local_development',
      models: [
        {
          id: config.profile.model_id,
          profileId: config.profile.id,
          name: 'Mel-RoFormer Viperx 1143',
          publicReleaseReady: false,
          licenseVerified: false,
          availableLocally: true,
        },
      ],
    }),
  );

  let uploads = 0;
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, _file, done) =>
        done(null, storage.folder(req.uploadId)),
      filename: (_req, _file, done) => done(null, 'input.upload'),
    }),
    limits: {
      fileSize: config.maxUploadBytes,
      files: 1,
      fields: 0,
      parts: 1,
      headerPairs: 100,
    },
  }).single('file');

  app.post(
    '/api/v1/jobs',
    rateLimit({
      windowMs: 60000,
      limit: 6,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'UPLOAD_RATE_LIMITED' },
    }),
    async (req, res) => {
      if (uploads >= 2) throw new HttpError(429, 'UPLOAD_BUSY');
      uploads++;
      const id = randomUUID();
      req.uploadId = id;
      let saved = false;
      try {
        if ((await store.countPending()) + uploads > config.maxPending)
          throw new HttpError(429, 'QUEUE_FULL');
        if (
          (await storage.freeBytes()) <
          config.minFreeDiskBytes + config.maxUploadBytes * 2
        )
          throw new HttpError(507, 'DISK_SPACE_LOW');
        await mkdir(storage.folder(id));
        await new Promise((done, fail) =>
          upload(req, res, (error) => (error ? fail(error) : done())),
        );
        if (!req.file) throw new HttpError(400, 'FILE_REQUIRED');
        const metadata = await probe(req.file.path, config);
        if (req.aborted || res.destroyed)
          throw new HttpError(400, 'UPLOAD_ABORTED');
        const token = randomBytes(32).toString('hex');
        const job = await store.create({
          id,
          tokenHash: hash(token).toString('hex'),
          originalFilename:
            [...basename(req.file.originalname.replaceAll('\\', '/'))]
              .filter(
                (char) =>
                  char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127,
              )
              .join('')
              .slice(0, 255) || 'audio',
          modelId: config.profile.model_id,
          durationSeconds: metadata.durationSeconds,
          expiresAt: new Date(Date.now() + config.ttlHours * 3600000),
        });
        saved = true;
        res.status(202).json({ ...safeJob(job), token });
        void scheduler.tick();
      } finally {
        uploads--;
        if (!saved) await storage.remove(id);
      }
    },
  );

  app.use('/api/v1/jobs/:id', async (req, res, next) => {
    if (!UUID.test(req.params.id)) throw new HttpError(404, 'JOB_NOT_FOUND');
    const auth = req.get('authorization') ?? '';
    if (!/^Bearer [0-9a-f]{64}$/.test(auth))
      throw new HttpError(404, 'JOB_NOT_FOUND');
    const job = await store.get(req.params.id);
    if (
      !job ||
      !timingSafeEqual(hash(auth.slice(7)), Buffer.from(job.tokenHash, 'hex'))
    )
      throw new HttpError(404, 'JOB_NOT_FOUND');
    req.job = job;
    next();
  });
  app.get('/api/v1/jobs/:id', (req, res) => res.json(safeJob(req.job)));
  const stream = (download) => async (req, res, next) => {
    if (
      req.job.status === 'EXPIRED' ||
      new Date(req.job.expiresAt).getTime() <= Date.now()
    )
      throw new HttpError(410, 'JOB_EXPIRED');
    if (req.job.status !== 'COMPLETED')
      throw new HttpError(409, 'RESULT_NOT_READY');
    if (!['vocals', 'instrumental'].includes(req.query.stem))
      throw new HttpError(400, 'INVALID_STEM');
    const path = await storage.result(req.job.id, req.query.stem);
    if (!(await stat(path)).size) throw new HttpError(409, 'RESULT_NOT_READY');
    res.type('audio/wav');
    const done = (error) => {
      if (error) next(error);
    };
    if (download)
      res.download(
        path,
        `${req.query.stem}.wav`,
        { cacheControl: false, dotfiles: 'allow' },
        done,
      );
    else res.sendFile(path, { cacheControl: false, dotfiles: 'allow' }, done);
  };
  app.get('/api/v1/jobs/:id/preview', stream(false));
  app.get('/api/v1/jobs/:id/download', stream(true));
  app.delete('/api/v1/jobs/:id', async (req, res) => {
    await scheduler.cancel(req.job.id);
    res.status(202).json({
      id: req.job.id,
      status: req.job.status === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED',
    });
  });
  app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND')));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    let status =
      error.status >= 400 && error.status <= 599 ? error.status : 500;
    let code = error instanceof HttpError ? error.code : 'INTERNAL_ERROR';
    if (error instanceof multer.MulterError) {
      status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      code = error.code;
    }
    if (error.code === 'ENOENT') {
      status = 404;
      code = 'FILE_NOT_FOUND';
    }
    if (error.status === 416) code = 'RANGE_NOT_SATISFIABLE';
    if (status >= 500)
      logger.error(JSON.stringify({ requestId: req.requestId, code }));
    res.status(status).json({ error: code, requestId: req.requestId });
  });
  return app;
}
