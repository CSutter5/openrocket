import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, open } from 'node:fs/promises';
import { resolve, delimiter } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(process.env.ORK_RADIUS_OUTPUT || resolve(root, 'build/radius-proof'));
const classpath = process.env.ORK_PROOF_CLASSPATH?.trim();
assert.ok(classpath, 'Set ORK_PROOF_CLASSPATH to the core test runtime classpath (see README)');
await mkdir(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const engineRoot = resolve(root, '../engine-adapter');
const engine = JSON.parse(await readFile(resolve(engineRoot, 'build/manifest.json'), 'utf8'));
for (const path of ['build/generated/teavm/js/reducer.js', 'src/main/java/proof/ImportedTubeProof.java', 'src/main/java/proof/ReducerFacade.java']) {
  assert.equal(hash(await readFile(resolve(engineRoot, path))), engine.hashes[path]?.sha256, `Rebuild the engine proof: ${path} differs from its build manifest`);
}
async function run(command, args, logPath, env = process.env) {
  const log = await open(logPath, 'w');
  try {
    const result = spawnSync(command, args, { cwd: root, env, stdio: ['ignore', log.fd, log.fd] });
    assert.equal(result.status, 0, `${command} failed; see ${logPath}`);
  } finally { await log.close(); }
}
await run(process.execPath, [resolve(root, '../node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.radius.config.ts'],
  resolve(output, 'workerd.log'), { ...process.env, ORK_RADIUS_OUTPUT: output });
const worker = JSON.parse(await readFile(resolve(output, 'report.json'), 'utf8'));
const classes = resolve(output, 'classes');
await mkdir(classes, { recursive: true });
await run('javac', ['-cp', classpath, '-d', classes,
  resolve(root, '../packages/ork-format/jvm/ArchiveDesktopProof.java'),
  resolve(root, '../packages/ork-format/jvm/RadiusDesktopProof.java')], resolve(output, 'javac.log'));
const desktop = {};
for (const [name, inputName, value] of [['normal', 'original.ork', 0.03], ['shrink', 'normal.ork', 0.0005]]) {
  const directory = resolve(output, `desktop-${name}`);
  await mkdir(directory, { recursive: true });
  const report = resolve(directory, 'report.json');
  const args = ['-cp', classes + delimiter + classpath];
  if (process.env.ORK_PROOF_MOTOR_CATALOG) args.push(`-Dork.proof.motorCatalog=${resolve(process.env.ORK_PROOF_MOTOR_CATALOG)}`);
  args.push('RadiusDesktopProof', resolve(output, inputName), resolve(output, `${name}.ork`),
    worker[name].effects.find(effect => effect.field === 'radius').entityId, String(value), report);
  await run('java', args, resolve(directory, 'desktop.log'));
  desktop[name] = JSON.parse(await readFile(report, 'utf8'));
  assert.equal(desktop[name].outcome, 'passed');
  // Compare the actual imported document's Java setter, including its intrinsic
  // before state, with the generated Java that executed inside authenticated DOs.
  assert.deepEqual(worker[name].intrinsic, { before: desktop[name].before, after: desktop[name].after });
  assert.equal(worker[name].archiveHash, desktop[name].editedSha256);
}
const sources = [
  'src/radius-room.ts', 'src/radius-index.ts', 'radius-proof/integration.ts',
  'vitest.radius.config.ts', 'wrangler.radius.jsonc', 'scripts/radius-proof.mjs',
  '../packages/ork-format/src/radius.js', '../packages/ork-format/jvm/RadiusDesktopProof.java',
  '../engine-adapter/src/main/java/proof/ImportedTubeProof.java',
  '../engine-adapter/build/generated/teavm/js/reducer.js',
];
const hashes = {};
for (const path of sources) hashes[path] = hash(await readFile(resolve(root, path)));
const summary = { schema: 1, outcome: 'passed', baseline: desktop.normal.baseline,
  reviewedCoreChanges: engine.reviewedCoreChanges, reducerBytes: engine.hashes['build/generated/teavm/js/reducer.js'].bytes,
  originalHash: worker.originalHash, sourceHashes: hashes,
  worker, desktop, limitation: 'Bounded explicit-radius import proof; no editor UI, full rocket projection, simulation rerun or hosted domain-reducer budget measurement' };
await writeFile(resolve(output, 'integrated.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ outcome: 'passed', output, originalHash: worker.originalHash,
  rejectedRequests: worker.rejectedRequests, components: worker.components, simulations: worker.simulations,
  normal: desktop.normal.after, shrink: desktop.shrink.after, counts: desktop.normal.counts }));
