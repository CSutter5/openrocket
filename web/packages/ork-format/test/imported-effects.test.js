import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importArchive } from '../src/index.js';
import { tubeRadiusInput, applyTubeRadius, PROOF_PRESETS } from '../src/radius.js';
import { deploymentInput, deploymentState, deploymentSimulationEffects, applyDeploymentReset } from '../src/deployment.js';
const encode = new TextEncoder();
const rocket = '10000000-0000-4000-8000-000000000000', tube = '10000001-0000-4000-8000-000000000000';
const chute = '10000002-0000-4000-8000-000000000000';
const a = '20000000-0000-4000-8000-000000000000', b = '20000001-0000-4000-8000-000000000000';
const fields = (event, altitude, delay) => `<deployevent>${event}</deployevent><deployaltitude>${altitude}</deployaltitude><deploydelay>${delay}</deploydelay>`;
const preset = PROOF_PRESETS[0];
const reference = `<preset type="${preset.type}" manufacturer="${preset.manufacturer}" partno="${preset.partno}" digest="${preset.digest}"/>`;
const override = `<deploymentconfiguration configid="${a}">${fields('altitude', 120, 1.5)}</deploymentconfiguration>`;
const xml = `<openrocket version="1.11"><rocket><name>R</name><id>${rocket}</id><motorconfiguration configid="${a}"/><motorconfiguration configid="${b}"/><subcomponents><bodytube><name>T</name><id>${tube}</id>${reference}<length>0.3</length><thickness>0.001</thickness><radius>0.03</radius><material type="bulk" density="680">Bulk</material><subcomponents><parachute><name>P</name><id>${chute}</id>${fields('apogee', 200, 0)}${override}</parachute></subcomponents></bodytube></subcomponents></rocket><simulations>${[a,b,a].map(id => `<simulation status="loaded"><conditions><configid>${id}</configid></conditions><flightdata><opaque>exact</opaque></flightdata></simulation>`).join('')}</simulations><future keep="1"/></openrocket>`;
const archive = text => importArchive(encode.encode(text));

test('real catalog reference is required; digest/type/order/automatic dependencies refuse explicitly', async () => {
  const input = tubeRadiusInput(await archive(xml), tube);
  assert.deepEqual(input.preset, preset);
  for (const source of [xml.replace(preset.digest, '0'.repeat(32)), xml.replace('type="BODY_TUBE"', 'type="PARACHUTE"'),
    xml.replace(reference, '').replace('<radius>', reference + '<radius>'), xml.replace('density="680"', 'density="680" other="safe"').replace('<radius>0.03</radius>', '<radius>auto 0.03</radius>'),
    xml.replace('</subcomponents></rocket>', '<bodytube><name>Auto</name><id>30000000-0000-4000-8000-000000000000</id><radius>auto 0.03</radius></bodytube></subcomponents></rocket>')]) {
    const imported = await archive(source);
    assert.throws(() => tubeRadiusInput(imported, tube), { code: 'UNSUPPORTED_RADIUS_INPUT' });
  }
});

test('preset no-op retains exact bytes; accepted changed effects remove only the actual reference', async () => {
  const original = await archive(xml), input = tubeRadiusInput(original, tube);
  const before = { radius: 0.03, thickness: 0.001, automatic: false, preset: true, presetDigest: preset.digest,
    mass: 1, cg: 0.15, length: 0.3, density: 680, filled: false, innerRadius: 0.029, volume: 0.001, listeners: 0 };
  assert.equal(await applyTubeRadius(original, input, before), original);
  const after = { ...before, radius: 0.0005, thickness: 0.0005, preset: false, presetDigest: null, innerRadius: 0 };
  const changed = await applyTubeRadius(original, input, after);
  assert.ok(!changed.xml.includes(reference));
  assert.equal(changed.xml, xml.replace(reference, '').replace('<radius>0.03</radius>', '<radius>0.0005</radius>')
    .replace('<thickness>0.001</thickness>', '<thickness>0.0005</thickness>').replaceAll('status="loaded"', 'status="outdated"'));
  await assert.rejects(applyTubeRadius(original, { ...input, preset: { ...preset, digest: '0'.repeat(32) } }, after), { code: 'CONFLICT' });
});

test('reset removes one override, inherits defaults and invalidates every simulation sharing only that configuration', async () => {
  const original = await archive(xml), input = deploymentInput(original, chute), before = deploymentState(input);
  const after = deploymentState({ ...input, overrides: [] });
  const effects = { before, after, functionalChange: true, configurationChanged: [true, false] };
  assert.deepEqual(deploymentSimulationEffects(original, input, a, effects).map(e => e.index), [0, 2]);
  const changed = await applyDeploymentReset(original, input, a, effects);
  assert.equal(changed.xml, xml.replace(override, '').replace(`<simulation status="loaded"><conditions><configid>${a}`, `<simulation status="outdated"><conditions><configid>${a}`)
    .replace(`</simulation><simulation status="loaded"><conditions><configid>${a}`, `</simulation><simulation status="outdated"><conditions><configid>${a}`));
  assert.deepEqual(changed.identity.simulations, original.identity.simulations);
});

test('inherited reset is byte-identical; equal-to-default override removal keeps current results', async () => {
  const original = await archive(xml), input = deploymentInput(original, chute), before = deploymentState(input);
  assert.equal(await applyDeploymentReset(original, input, b, { before, after: before, functionalChange: false }), original);
  const equalXml = xml.replace(fields('altitude', 120, 1.5), fields('apogee', 200, 0));
  const equal = await archive(equalXml), equalInput = deploymentInput(equal, chute);
  const changed = await applyDeploymentReset(equal, equalInput, a, { before: deploymentState(equalInput), functionalChange: false });
  assert.equal(changed.xml, equalXml.replace(override.replace(fields('altitude', 120, 1.5), fields('apogee', 200, 0)), ''));
});

test('partial/duplicate/opaque overrides, unresolved simulations, wrong ordering and invalid values refuse', async () => {
  for (const source of [xml.replace(override, override + override), xml.replace(override, override.replace('<deploydelay>1.5</deploydelay>', '')),
    xml.replace(override, override.replace('</deploymentconfiguration>', '<!-- keep --></deploymentconfiguration>')),
    xml.replace(override, override.replace('</deploymentconfiguration>', '<unknown/></deploymentconfiguration>')),
    xml.replace('<configid>' + a, '<configid>ffffffff-ffff-4fff-8fff-ffffffffffff'),
    xml.replace(fields('apogee', 200, 0) + override, override + fields('apogee', 200, 0)),
    xml.replace('<deploydelay>1.5</deploydelay>', '<deploydelay>NaN</deploydelay>')]) {
    const imported = await archive(source);
    assert.throws(() => deploymentInput(imported, chute));
  }
  const imported = await archive(xml), input = deploymentInput(imported, chute);
  await assert.rejects(applyDeploymentReset(imported, { ...input, default: { ...input.default, altitude: 300 } }, a, {}));
  await assert.rejects(applyDeploymentReset(imported, input, 'ffffffff-ffff-4fff-8fff-ffffffffffff', {}));
});
