import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';

const readJson = (path) =>
  JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const profile = readJson('config/ai-profile.json');
const registry = readJson('config/models.json');
assert.equal(profile.schema_version, 1);
assert.equal(profile.scope, 'local_development');
const model = registry.models.find((item) => item.id === profile.model_id);
assert.ok(model, 'Selected local model must exist in registry');
assert.equal(profile.checkpoint_filename, model.checkpoint_filename);
assert.equal(profile.checkpoint_sha256, model.sha256);
const reportPath = relative(
  resolve('docs/reports'),
  resolve(profile.evidence_report),
);
assert.ok(
  reportPath && !reportPath.startsWith('..') && !isAbsolute(reportPath),
  'Evidence must stay in docs/reports',
);
const report = readJson(profile.evidence_report);
assert.equal(report.status, 'COMPLETED');
assert.equal(report.exit_code, 0);
assert.equal(report.model_id, profile.model_id);
assert.equal(report.checkpoint_sha256, profile.checkpoint_sha256);
assert.equal(report.config_sha256, profile.yaml_sha256);
assert.deepEqual(
  profile.inference_config,
  report.inference_config,
  'Profile must match the accepted experiment',
);
assert.equal(profile.worker_concurrency, 1);
assert.equal(profile.device, 'cpu');
assert.equal(profile.precision, 'fp32');
assert.equal(profile.threads, 2);
assert.equal(profile.denoise, false);
assert.equal(profile.dereverb, false);
assert.equal(
  profile.public_release_ready,
  false,
  'Local acceptance does not authorize public release',
);
assert.equal(
  profile.fallback_model_id,
  null,
  'No accepted fallback is currently established',
);
console.log(
  'Local AI profile matches completed experiment. Public release remains unverified.',
);
