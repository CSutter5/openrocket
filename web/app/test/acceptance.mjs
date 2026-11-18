import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { resolve } from 'node:path';
import { output, repo } from './fixtures.mjs';
assert.ok(process.env.ORK_PROOF_CLASSPATH?.trim(), 'Set ORK_PROOF_CLASSPATH to the documented desktop test runtime classpath');
await mkdir(output, { recursive: true });
const url = 'http://127.0.0.1:4173';
const server = spawn(process.execPath, [resolve(repo, 'web/node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
  { cwd: resolve(repo, 'web/app'), stdio: ['ignore', 'pipe', 'pipe'] });
let log = '', exited = false;
server.stdout.on('data', data => { log += data; }); server.stderr.on('data', data => { log += data; });
server.on('exit', () => { exited = true; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (exited) throw new Error('POC preview exited: ' + log);
    try { ready = log.includes('Local:') && (await fetch(url)).ok; } catch {}
    if (ready) break;
    await setTimeout(100);
  }
  assert.ok(ready, 'Local production preview failed to start');
  process.env.ORK_POC_URL = url;
  await import('./p02.mjs');
  await import('./roundtrip.mjs');
  await import('./drawing.mjs');
  await import('./properties.mjs');
  const report = JSON.parse(await readFile(resolve(output, 'roundtrip.json'), 'utf8'));
  const engine = JSON.parse(await readFile(resolve(repo, 'web/engine-adapter/build/manifest.json'), 'utf8'));
  await writeFile(resolve(output, 'gp.json'), JSON.stringify({ gate: 'GP', outcome: 'passed',
    browser: report.browser, sourceRevision: engine.sourceRevision, reviewedCoreChanges: engine.reviewedCoreChanges,
    reducer: engine.hashes['build/generated/teavm/js/reducer.js'],
    checks: ['production build served on loopback without auth/backend', 'real sample and local archive import, tree and keyboard selection',
      'rename, radius, Java intrinsic dimensions/mass/local CG and SVG update', 'no-op name/radius and unchanged download',
      'invalid numbers, unsupported graph/component and preservation-only input', 'failed edit/replacement retain accepted archive bytes',
      'explicit-hole underfit rejection and retained failing desktop-reload control', 'UI download, app reimport and pinned desktop serialization/save/reload',
      'opaque XML, script XML, attachments, IDs/references and stored series exact; affected results outdated',
      'exterior SVG vertices match actual desktop geometry; click and keyboard selection', 'length/wall setters, preset effects and clamped setter-event invalidation match desktop'],
    roundtrip: 'roundtrip.json', interactions: 'interactions.json', drawing: 'drawing-report.json', properties: 'properties-report.json', g1: 'held',
    limits: 'Bounded local POC; no simulations, accounts, collaboration, hosted services or full desktop compatibility' }, null, 2) + '\n');
  console.log(`GP passed in Chromium; actual UI downloads and desktop evidence: ${output}`);
} finally {
  server.kill('SIGTERM');
  await writeFile(resolve(output, 'preview.log'), log);
}
