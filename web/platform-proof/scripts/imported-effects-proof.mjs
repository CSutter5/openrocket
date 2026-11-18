import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, open } from 'node:fs/promises';
import { resolve, delimiter } from 'node:path';
import { zipSync, unzipSync, strFromU8, strToU8 } from 'fflate';
import { importArchive } from '../../packages/ork-format/src/index.js';
import { PROOF_PRESETS } from '../../packages/ork-format/src/radius.js';

const automaticRing = process.env.ORK_EFFECTS_AUTOMATIC_RING === '1';
const root = resolve(import.meta.dirname, '..'), repo = resolve(root, '../..');
const output = resolve(process.env.ORK_EFFECTS_OUTPUT || resolve(root, 'build/imported-effects'));
const classpath = process.env.ORK_PROOF_CLASSPATH?.trim();
assert.ok(classpath, 'Set ORK_PROOF_CLASSPATH to the documented core test runtime classpath');
await mkdir(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const engineRoot = resolve(root, '../engine-adapter');
const engine = JSON.parse(await readFile(resolve(engineRoot, 'build/manifest.json'), 'utf8'));
for (const path of ['build.gradle', 'build/generated/teavm/js/reducer.js', 'src/main/java/proof/ImportedTubeProof.java',
  'src/main/java/proof/ImportedRingProof.java', 'src/main/java/proof/ImportedDeploymentProof.java', 'src/main/java/proof/PortableDigest.java',
  'src/main/java/info/openrocket/core/preset/ProofPresetCatalog.java', 'src/main/java/proof/ReducerFacade.java']) {
  assert.equal(hash(await readFile(resolve(engineRoot, path))), engine.hashes[path]?.sha256, `Rebuild engine: ${path}`);
}
const commands = [];
async function run(command, args, logPath, env = process.env) {
  const log = await open(logPath, 'w'), started = performance.now();
  try {
    const result = spawnSync(command, args, { cwd: root, env, stdio: ['ignore', log.fd, log.fd] });
    commands.push({ command: [command, ...args], wallMs: performance.now() - started, exitCode: result.status });
    assert.equal(result.status, 0, `${command} failed; see ${logPath}`);
  } finally { await log.close(); }
}
const classes = resolve(output, 'classes'); await mkdir(classes, { recursive: true });
const source = name => resolve(repo, 'web/packages/ork-format/jvm', name + '.java');
await run('javac', ['-cp', classpath, '-d', classes, source('ArchiveDesktopProof'), source('RadiusDesktopProof'), source('ImportedEffectsDesktopProof'),
  resolve(engineRoot, 'src/main/java/proof/ImportedRingProof.java'),
  resolve(engineRoot, 'src/main/java/proof/ImportedTubeProof.java'), resolve(engineRoot, 'src/main/java/proof/ImportedDeploymentProof.java'),
  resolve(engineRoot, 'src/main/java/info/openrocket/core/preset/ProofPresetCatalog.java'), resolve(engineRoot, 'src/main/java/proof/PortableDigest.java')], resolve(output, 'javac.log'));
const java = [`-Djava.util.prefs.userRoot=${output}/jvm-preferences`, '-cp', classes + delimiter + classpath, 'ImportedEffectsDesktopProof'];
await run('java', [...java, 'digests'], resolve(output, 'jvm-digests.log'));
await run('java', [...java, automaticRing ? 'generate-ring' : 'generate', resolve(repo, 'core/src/main/resources/datafiles/examples/A simple model rocket.ork'), output], resolve(output, 'generate.log'));
assert.deepEqual(JSON.parse(await readFile(resolve(output, 'catalog.json'), 'utf8')), PROOF_PRESETS);
// Add opaque content after desktop generation; preserved lexically even when the
// desktop loader ignores it. Historical series are unverified fixture data.
for (const key of ['G1-A', 'G1-B']) {
  const path = resolve(output, `${key}.ork`), entries = unzipSync(await readFile(path));
  let xml = strFromU8(entries['rocket.ork']);
  xml = xml.replace('</openrocket>', '<g1:opaque xmlns:g1="urn:g1:effects" value="keep &amp; exact"><![CDATA[<script>opaque()</script>]]></g1:opaque></openrocket>')
    .replace(/<simulation status="outdated"/g, '<simulation status="loaded"');
  const parsed = await importArchive(strToU8(xml));
  const first = parsed.parsed.simulations[0];
  xml = xml.slice(0, first.end) + xml.slice(first.start, first.end).replace('<name>', '<name>Shared configuration ') + xml.slice(first.end);
  entries['rocket.ork'] = strToU8(xml); entries['opaque/effects.bin'] = new Uint8Array([0, 255, 13, 10, 7]);
  await writeFile(path, zipSync(entries, { level: 6, mtime: new Date(1980, 0, 1) }));
}
let underfit;
if (automaticRing) {
  const report = resolve(output, 'underfit/report.json');
  await run('java', [...java, 'probe-ring-underfit', resolve(output, 'G1-A.ork'), report], resolve(output, 'underfit.log'));
  underfit = JSON.parse(await readFile(report, 'utf8'));
}
// Node's MD5 and known RFC empty vector independently check the adapted primitive
// on all short lengths (padding boundaries), multi-block inputs and high bytes.
const vectors = Array.from({ length: 130 }, (_, i) => i).concat([255, 256, 511, 512, 513, 4096]);
const digests = vectors.map(length => ({ length, digest: createHash('md5').update(Uint8Array.from({ length }, (_, i) => i & 255)).digest('hex') }));
assert.equal(digests[0].digest, 'd41d8cd98f00b204e9800998ecf8427e');
await run(process.execPath, [resolve(root, '../node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.effects.config.ts'], resolve(output, 'workerd.log'),
  { ...process.env, ORK_EFFECTS_OUTPUT: output, ORK_EFFECTS_DIGESTS: JSON.stringify(digests) });
const worker = JSON.parse(await readFile(resolve(output, 'report.json'), 'utf8'));
const desktop = {};
for (const test of worker.cases) {
  const directory = resolve(output, `desktop-${test.name}`); await mkdir(directory, { recursive: true });
  const reportPath = resolve(directory, 'report.json');
  await run('java', [...java, resolve(output, test.source), resolve(output, test.export), test.edit.type,
    test.edit.componentId, String(test.edit.value ?? test.edit.configurationId), reportPath], resolve(directory, 'desktop.log'));
  const report = JSON.parse(await readFile(reportPath, 'utf8')); desktop[test.name] = report;
  assert.deepEqual(test.ack.intrinsic, report.state, `Actual-document JVM/Workers state: ${test.name}`);
  assert.equal(test.ack.archiveHash, report.editedSha256);
}
const sourceHashes = {};
for (const path of ['src/radius-room.ts', 'effects-proof/integration.ts', 'scripts/imported-effects-proof.mjs', 'vitest.effects.config.ts',
  '../packages/ork-format/src/radius.js', '../packages/ork-format/src/deployment.js', '../packages/ork-format/jvm/ImportedEffectsDesktopProof.java']) {
  sourceHashes[path] = hash(await readFile(resolve(root, path)));
}
const summary = { schema: 1, outcome: 'passed', baseline: engine.sourceRevision, reviewedCoreChanges: engine.reviewedCoreChanges,
  engineArtifacts: engine.hashes, sourceHashes, worker, desktop, commands, underfit,
  measurements: { kind: 'local host wall; includes development JVM/process work', hostedCpu: null, isolateHeap: null },
  g1: 'hold' };
await writeFile(resolve(output, 'integrated.json'), JSON.stringify(summary, null, 2) + '\n');
const stateSnapshots = {};
const cases = worker.cases.map(test => {
  const report = desktop[test.name], state = test.ack.intrinsic;
  const stateHashes = {};
  for (const phase of ['before', 'after']) {
    const digest = hash(JSON.stringify(state[phase])); stateHashes[phase] = digest;
    stateSnapshots[digest] = state[phase];
  }
  return { name: test.name, edit: test.edit, sequence: test.ack.sequence,
    inputSha256: report.inputSha256, exportedSha256: report.editedSha256, semanticSha256: report.semanticSha256,
    stateHashes, functionalChange: state.functionalChange, configurationChanged: state.configurationChanged, rocketChanged: state.rocketChanged,
    statusesBefore: report.statusesBefore, statusesAfter: report.statusesAfter,
    fullSerializationEqual: report.fullSerializationEqual, desktopReloadEqual: report.desktopReloadEqual, counts: report.counts };
});
const fixtures = {};
for (const key of ['G1-A', 'G1-B']) {
  const bytes = await readFile(resolve(output, `${key}.ork`)), archive = await importArchive(new Uint8Array(bytes));
  fixtures[key] = { sha256: hash(bytes), bytes: bytes.length, xmlBytes: strToU8(archive.xml).length,
    entries: archive.entries.map(e => ({ path: e.path, sha256: e.sha256, bytes: e.bytes.length })) };
}
await writeFile(resolve(output, 'evidence.json'), JSON.stringify({ schema: 1, outcome: 'passed',
  baseline: engine.sourceRevision, reviewedCoreChanges: engine.reviewedCoreChanges,
  artifacts: Object.fromEntries(Object.entries(engine.hashes).filter(([p]) => p.endsWith('.js'))), sourceHashes,
  fixtures, catalog: PROOF_PRESETS, stateSnapshots, cases, digestVectors: worker.digestVectors,
  rejectedRequests: worker.rejectedRequests, preservation: worker.preservation, durability: worker.durability,
  measurements: worker.measurements, automaticRing, underfit, g1: 'hold',
  rawEvidence: output, runtime: { node: process.versions.node, java: engine.java, teavm: engine.teavm, workers: worker.runtime },
  limitations: [automaticRing ? 'One direct automatic-outer/explicit-inner CenteringRing; centered TOP-positioned single instance; underfit edits refused' : 'Bounded two-record preset catalog and explicit geometry', 'One parachute configuration reset, at most 16 configurations',
    'No mutable preference isolation policy', 'No hosted reducer CPU, isolate heap or budget-limit proof', 'No simulation rerun or GUI exercise'],
}, null, 2) + '\n');
console.log(JSON.stringify({ outcome: 'passed', output, cases: worker.cases.length, rejectedRequests: worker.rejectedRequests, measurements: worker.measurements }));
