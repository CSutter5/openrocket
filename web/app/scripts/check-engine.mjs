import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../..'), engine = resolve(root, 'web/engine-adapter');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  const manifest = JSON.parse(await readFile(resolve(engine, 'build/manifest.json'), 'utf8'));
  assert.equal(manifest.sourceRevision, '33bdb6d3062a6d9ef44a00d1ff865f962136e9e9');
  for (const [path, entry] of Object.entries(manifest.hashes)) assert.equal(hash(await readFile(resolve(engine, path))), entry.sha256, `Stale engine: ${path}`);
  for (const [path, entry] of Object.entries(manifest.catalogs)) assert.equal(hash(await readFile(resolve(root, path))), entry.sha256, `Catalog source changed: ${path}`);
  for (const change of manifest.reviewedCoreChanges) assert.equal(hash(await readFile(resolve(root, change.path))), change.sha256, `Core source changed: ${change.path}`);
  const pin = spawnSync('git', ['diff', '--exit-code', manifest.sourceRevision, '--', 'core/src/main/java',
    ...manifest.reviewedCoreChanges.map(c => ':(exclude)' + c.path)], { cwd: root, encoding: 'utf8' });
  assert.equal(pin.status, 0, 'Pinned core source differs; run the engine build to diagnose');
  console.log('Pinned engine, adapter sources and catalog hashes match build manifest.');
} catch (error) { console.error(`${error.message}\nRun node web/engine-adapter/scripts/build.mjs from the repository root first.`); process.exit(1); }
