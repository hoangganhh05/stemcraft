import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { ROOT } from './config.mjs';

const execute = promisify(execFile);
async function checksum(path) {
  const digest = createHash('sha256');
  for await (const block of createReadStream(path)) digest.update(block);
  return digest.digest('hex');
}

export async function preflight(config) {
  await access(config.python);
  for (const tool of [config.ffmpeg, config.ffprobe])
    await execute(tool, ['-version'], { timeout: 15000, windowsHide: true });
  const profile = config.profile;
  const model = resolve(ROOT, 'models', profile.checkpoint_filename);
  const yaml = model.replace(/\.ckpt$/, '.yaml');
  if (
    (await checksum(model)) !== profile.checkpoint_sha256 ||
    (await checksum(yaml)) !== profile.yaml_sha256
  )
    throw new Error('Model hash mismatch');
  config.modelReady = true;
}
