// Isolated UI fixture on port 3101. Never imports a model, DB client or production scheduler.
import express from 'express';
import { randomUUID } from 'node:crypto';

const app = express();
app.use(express.json());
let scenario = 'complete',
  job = null,
  polls = 0,
  mediaRequests = [];
const token = 'a'.repeat(64);
const audio = Buffer.alloc(44 + 44100 * 4);
audio.write('RIFF');
audio.writeUInt32LE(audio.length - 8, 4);
audio.write('WAVEfmt ', 8);
audio.writeUInt32LE(16, 16);
audio.writeUInt16LE(1, 20);
audio.writeUInt16LE(2, 22);
audio.writeUInt32LE(44100, 24);
audio.writeUInt32LE(176400, 28);
audio.writeUInt16LE(4, 32);
audio.writeUInt16LE(16, 34);
audio.write('data', 36);
audio.writeUInt32LE(audio.length - 44, 40);
for (let index = 0; index < 44100; index++) {
  const sample = Math.round(
    Math.sin((index * 2 * Math.PI * 440) / 44100) * 4000,
  );
  audio.writeInt16LE(sample, 44 + index * 4);
  audio.writeInt16LE(sample, 46 + index * 4);
}
app.post('/__test/reset', (req, res) => {
  scenario = req.body.scenario ?? 'complete';
  job = null;
  polls = 0;
  mediaRequests = [];
  res.sendStatus(204);
});
app.get('/__test/media', (_req, res) => res.json(mediaRequests));
app.get('/__test/fixture.wav', (_req, res) =>
  res.type('audio/wav').send(audio),
);
app.get('/api/v1/health', (_req, res) =>
  res.json({
    status: 'ok',
    limits: {
      maxUploadBytes: 50 * 1024 ** 2,
      maxDurationSeconds: 600,
      ttlHours: 24,
    },
  }),
);
app.post('/api/v1/jobs', (req, res) => {
  req.resume();
  req.on('end', () => {
    job = {
      id: randomUUID(),
      originalFilename: 'test-song.wav',
      modelId: 'mel-band-roformer-vocal',
      status: 'QUEUED',
      progress: 0,
      completedChunks: 0,
      totalChunks: 0,
      durationSeconds: 1,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };
    res.status(202).json({ ...job, token });
  });
});
app.use('/api/v1/jobs/:id', (req, res, next) => {
  if (
    !job ||
    req.params.id !== job.id ||
    req.get('authorization') !== `Bearer ${token}`
  )
    return res.status(404).json({ error: 'JOB_NOT_FOUND' });
  next();
});
app.get('/api/v1/jobs/:id', (_req, res) => {
  if (job.status !== 'CANCELLED') {
    polls++;
    if (scenario === 'expired') job.status = 'EXPIRED';
    else if (scenario === 'failed') {
      job.status = 'FAILED';
      job.errorCode = 'MEMORY_LIMIT';
    } else if (scenario === 'hold' || polls < 2) {
      job.status = 'PROCESSING';
      job.progress = 33;
      job.completedChunks = 1;
      job.totalChunks = 3;
    } else {
      job.status = 'COMPLETED';
      job.progress = 100;
      job.completedChunks = 3;
      job.totalChunks = 3;
    }
  }
  res.json(job);
});
app.delete('/api/v1/jobs/:id', (_req, res) => {
  job.status = 'CANCELLED';
  res.status(202).json({ id: job.id, status: 'CANCELLED' });
});
for (const route of ['preview', 'download'])
  app.get(`/api/v1/jobs/:id/${route}`, (req, res) => {
    mediaRequests.push({
      authenticated: req.get('authorization') === `Bearer ${token}`,
      range: req.get('range') ?? null,
      stem: req.query.stem,
    });
    if (route === 'download')
      res.set(
        'Content-Disposition',
        `attachment; filename="${req.query.stem}.wav"`,
      );
    res
      .type('audio/wav')
      .set('Accept-Ranges', 'bytes')
      .set('Cache-Control', 'no-store');
    const match = req.get('range')?.match(/^bytes=(\d+)-(\d*)$/);
    if (match) {
      const start = Number(match[1]),
        end = match[2]
          ? Math.min(Number(match[2]), audio.length - 1)
          : audio.length - 1;
      if (start > end) return res.status(416).end();
      return res
        .status(206)
        .set('Content-Range', `bytes ${start}-${end}/${audio.length}`)
        .send(audio.subarray(start, end + 1));
    }
    res.send(audio);
  });
app.listen(3101, '127.0.0.1', () =>
  console.log('UI fixture ready (no inference)'),
);
