import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DESKTOP_REVISION, negotiateProtocol, simulationInputHash, resultIsCurrent } from '../index.mjs';

const input = {
  schema: 1, desktopRevision: DESKTOP_REVISION,
  engineHash: '1'.repeat(64), motorCatalogHash: '2'.repeat(64), materialCatalogHash: '3'.repeat(64),
  archiveTreeHash: '4'.repeat(64), identitySidecarHash: '5'.repeat(64),
  simulationId: 'simulation-a', configurationId: 'configuration-a', optionsHash: '6'.repeat(64),
  extensionSetHash: '7'.repeat(64), seed: 123, integrator: 'RK6',
};

test('late completion retains its input identity; each relevant input makes it stale', async () => {
  const result = {schema: 1, status: 'completed', source: 'browser-client', inputHash: await simulationInputHash(input)};
  assert.equal(await resultIsCurrent(result, input), true);
  for (const field of Object.keys(input).filter(key => !['schema', 'desktopRevision'].includes(key))) {
    const changed = {...input, [field]: field.endsWith('Hash') ? 'a'.repeat(64) :
      field === 'seed' ? 124 : field === 'integrator' ? 'RK4' : `${input[field]}-changed`};
    assert.equal(await resultIsCurrent(result, changed), false, field);
  }
  assert.equal(await resultIsCurrent({...result, status: 'running'}, input), false);
  assert.equal(await resultIsCurrent({...result, source: 'server-certified'}, input), false);
});

test('provenance rejects incomplete/ambiguous manifests and negotiates protocol explicitly', async () => {
  assert.equal(await simulationInputHash(input), await simulationInputHash(Object.fromEntries(Object.entries(input).reverse())));
  await assert.rejects(simulationInputHash({...input, seed: NaN}));
  await assert.rejects(simulationInputHash({...input, engineHash: 'missing'}));
  await assert.rejects(simulationInputHash({...input, extra: 'unbound input'}));
  assert.equal(negotiateProtocol([2, 1]), 1);
  assert.throws(() => negotiateProtocol([2]), /version/);
});
