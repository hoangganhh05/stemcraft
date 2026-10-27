import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);

export class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export async function probeAudio(path, config) {
  let report;
  try {
    const result = await execute(
      config.ffprobe,
      ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path],
      { timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true },
    );
    report = JSON.parse(result.stdout);
  } catch (error) {
    if (
      error.code === 'ENOENT' ||
      error.code === 'EACCES' ||
      error.code === 'EPERM'
    )
      throw new HttpError(503, 'PROBE_UNAVAILABLE');
    throw new HttpError(415, 'INVALID_AUDIO');
  }
  const streams = report.streams ?? [];
  const audio = streams.filter((stream) => stream.codec_type === 'audio');
  const format = report.format?.format_name?.split(',') ?? [];
  const duration = Number(report.format?.duration ?? audio[0]?.duration);
  if (
    !format.some((name) => ['mp3', 'wav', 'flac'].includes(name)) ||
    audio.length !== 1 ||
    streams.some((stream) => !['audio', 'video'].includes(stream.codec_type)) ||
    streams.some(
      (stream) =>
        stream.codec_type === 'video' && !stream.disposition?.attached_pic,
    )
  )
    throw new HttpError(415, 'UNSUPPORTED_FORMAT');
  const stream = audio[0];
  const allowed = [
    'mp3',
    'flac',
    'pcm_s16le',
    'pcm_s24le',
    'pcm_s32le',
    'pcm_f32le',
    'pcm_f64le',
    'pcm_u8',
  ];
  if (
    !allowed.includes(stream.codec_name) ||
    ![1, 2].includes(stream.channels) ||
    !(
      Number(stream.sample_rate) >= 8000 && Number(stream.sample_rate) <= 192000
    )
  )
    throw new HttpError(415, 'UNSUPPORTED_AUDIO');
  if (
    !Number.isFinite(duration) ||
    duration < 0.5 ||
    duration > config.maxDuration
  )
    throw new HttpError(422, 'DURATION_LIMIT');
  return { durationSeconds: duration };
}
