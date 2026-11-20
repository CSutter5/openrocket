import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const app = resolve(import.meta.dirname, '..'), catalog = JSON.parse(await readFile(resolve(app, 'src/simulation/motor-index.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(await readFile(resolve(app, '../../core/src/main/resources/datafiles/thrustcurves/initial_motors.db'))), catalog.sourceSha256);
assert.equal(catalog.motors.length, 1942);
assert.equal(new Set(catalog.motors.map(m => m.key)).size, 1942);
for (const motor of catalog.motors) {
  assert.equal(hash(await readFile(resolve(app, 'public/motors', motor.sha256 + '.rse'))), motor.sha256);
  assert.ok(Number.isFinite(motor.impulse) && motor.impulse > 0);
  assert.ok(motor.diameter > 0 && motor.length > 0);
}
console.log('All 1942 generated catalog records and curve asset hashes match the pinned database export.');
