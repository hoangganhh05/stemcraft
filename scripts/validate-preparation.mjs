import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const registry = JSON.parse(readFileSync('config/models.json', 'utf8'));
assert.equal(registry.schema_version, 1);
assert.equal(
  new Set(registry.models.map((model) => model.id)).size,
  registry.models.length,
);
for (const model of registry.models) {
  if (model.available) {
    assert.equal(model.license_verified, true);
    assert.ok(
      model.source_url &&
        model.checkpoint_license_url &&
        model.checkpoint_filename,
    );
    assert.match(model.sha256, /^[a-f0-9]{64}$/i);
  }
}
if (registry.selected_model_id !== null) {
  assert.ok(
    registry.models.some(
      (model) => model.id === registry.selected_model_id && model.available,
    ),
  );
}
console.log(
  'Preparation checks passed. Checkpoint availability and benchmark results require separate verification.',
);
