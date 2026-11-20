import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { filterMotors, defaultFilters, mountDiameterStop } from '../src/simulation/motor-filters.ts';
const catalog = JSON.parse(await readFile(new URL('../src/simulation/motor-index.json', import.meta.url), 'utf8')).motors;
const base = { ...catalog[0], key: 'test', manufacturer: 'AeroTech', designation: 'J800T', commonName: 'J800', caseInfo: 'RMS 54/1280', group: -1, similar: [], available: true, filterImpulse: 1280, diameter: .0381, length: .2 };
const include = (motor, changes = {}, mount, selected) => filterMotors([motor], { ...defaultFilters, ...changes }, mount, selected).length === 1;
assert.equal(include(base, { search: 'aerotech j800 54/1280' }), true);
assert.equal(include(base, { search: 'aerotech cesaroni' }), false);
assert.equal(include(base, { manufacturers: [] }), false);
assert.equal(include(base, { manufacturers: ['AeroTech'] }), true);
assert.equal(include({ ...base, available: false }), false);
assert.equal(include({ ...base, available: false }, { hideUnavailable: false }), true);
assert.equal(include(base, { hideUsed: true }, { usedGroups: [-1] }), false);
assert.equal(include(base, { hideUsed: true }, { usedGroups: [999] }), true);
assert.equal(include(base, {}, undefined, { ...base, key: 'other', similar: ['test'] }), false);
assert.equal(include(base, { hideSimilar: false }, undefined, { ...base, key: 'other', similar: ['test'] }), true);
assert.equal(include(base, {}, undefined, base), true);
// Native class boundaries: J is (640,1280], A includes fractional-A motors, O has no upper cap.
for (const [impulse, accepted] of [[640, false], [641, true], [1280, true], [1281, false]]) assert.equal(include({ ...base, filterImpulse: impulse }, { minImpulse: 9, maxImpulse: 9 }), accepted);
assert.equal(include({ ...base, filterImpulse: 0 }, { minImpulse: 0, maxImpulse: 0 }), true);
assert.equal(include({ ...base, filterImpulse: 1000000 }, { minImpulse: 14, maxImpulse: 14 }), true);
// Nominal 38 mm accepts native 38.1 mm cases, using strict native tolerance endpoints.
for (const [diameter, accepted] of [[.0365, false], [.0366, true], [.0381, true], [.0384, false]]) assert.equal(include({ ...base, diameter }, { minDiameter: 7, maxDiameter: 7 }), accepted);
assert.equal(mountDiameterStop(.0381), 7);assert.equal(mountDiameterStop(.0758), 9);
assert.equal(include(base, { fitDiameter: true }, { usedGroups: [], diameter: .0381 }), true);
assert.equal(include({ ...base, diameter: .054 }, { fitDiameter: true }, { usedGroups: [], diameter: .0381 }), false);
assert.equal(include(base, { minLength: '200', maxLength: '200' }), true);
assert.equal(include({ ...base, length: .20001 }, { maxLength: '200' }), false);
assert.equal(include(base, { minLength: '201', maxLength: '200' }), false);
assert.equal(include(base, { fitLength: true }, { usedGroups: [], length: .199 }), false);
assert.equal(include(base, { fitLength: true }, { usedGroups: [], length: .2 }), true);
// Real native metadata must form complete, symmetric, same-set similarity relationships.
const keys = new Map(catalog.map(m => [m.key, m]));
for (const motor of catalog) {
  assert.ok(Number.isInteger(motor.group) && motor.group >= 0 && Number.isFinite(motor.filterImpulse));
  assert.ok(motor.manufacturerNames.length > 0);
  for (const key of motor.similar) { const sibling = keys.get(key);assert.ok(sibling);assert.equal(sibling.group, motor.group);assert.ok(sibling.similar.includes(motor.key)); }
}
const similar = catalog.find(m => m.similar.length > 0);assert.ok(similar);
assert.equal(filterMotors(catalog, defaultFilters, undefined, similar).length, catalog.filter(m => m.available).length - similar.similar.length);
console.log('Motor filters passed: native impulse/diameter boundaries, mount fit, length, manufacturer/search, availability/used groups and actual catalog similarity relationships.');
