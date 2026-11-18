import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { componentNames, exportArchive, importArchive } from '../src/index.js';
import { renameComponent, sha256 } from '../src/index.js';
const repo = new URL('../../../../', import.meta.url);
const output = process.argv[2] ?? '/tmp/openrocket-ork-desktop-proof';
const classpath = process.env.ORK_PROOF_CLASSPATH;
if (!classpath) throw Error('Set ORK_PROOF_CLASSPATH to core test runtimeClasspath');
await mkdir(output, { recursive: true });
const source = process.env.ORK_PROOF_INPUT || fileURLToPath(new URL('core/src/main/resources/datafiles/examples/A simple model rocket.ork', repo));
const original = await importArchive(new Uint8Array(await readFile(source)));
const target = componentNames(original).find(c => c.type === 'bodytube');
const name = 'Web & desktop <proof>';
const exported = await exportArchive(await renameComponent(original, target.id, target.name, name));
const editedPath = resolve(output, 'web-edited.ork'), desktopPath = resolve(output, 'desktop-resaved.ork');
await writeFile(editedPath, exported.bytes);
execFileSync('javac', ['-cp', classpath, '-d', output, fileURLToPath(new URL('../jvm/ArchiveDesktopProof.java', import.meta.url))], { stdio: 'inherit' });
const stdout = execFileSync('java', ['-Djava.awt.headless=true', '-Djava.util.prefs.userRoot='+resolve(output,'preferences'), '-cp', output+':'+classpath,
  'ArchiveDesktopProof', source, editedPath, desktopPath, target.id, name], { encoding: 'utf8', maxBuffer: 8*1024*1024 });
console.log(stdout.split('\n').filter(l => l.startsWith('PROOF')).join('\n'));
const desktopBytes = new Uint8Array(await readFile(desktopPath));
const desktop = await importArchive(desktopBytes, exported.identity);
if (!desktop.diagnostics.includes('SIDECAR_RECONCILIATION_REQUIRED')) throw Error('Desktop sidecar loss was not explicit');
if (componentNames(desktop).find(c => c.id === target.id)?.name !== name) throw Error('Desktop lost edited name/ID');
for (const entry of original.entries.filter(e => e.path.startsWith('decals/') || e.path.startsWith('thrustcurves/'))) {
  if (desktop.entries.find(e => e.path === entry.path)?.sha256 !== entry.sha256) throw Error('Desktop asset changed: '+entry.path);
}
const report = { baseline: '33bdb6d3062a6d9ef44a00d1ff865f962136e9e9', fixture: process.env.ORK_PROOF_INPUT ? 'generated-format111-from-A-simple-model-rocket' : 'core/src/main/resources/datafiles/examples/A simple model rocket.ork',
  inputSha256: await sha256(original.original), webExportSha256: await sha256(exported.bytes), desktopExportSha256: await sha256(desktopBytes),
  targetId: target.id, name, desktopResult: stdout.split('\n').find(l => l.startsWith('PROOF')),
  assets: desktop.entries.filter(e => e.path.startsWith('decals/') || e.path.startsWith('thrustcurves/')).map(e => ({path:e.path,sha256:e.sha256})),
  sidecarDiagnostics: desktop.diagnostics };
await writeFile(resolve(output, 'report.json'), JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if (process.env.ORK_PROOF_INPUT) {
  if (!desktop.xml.includes('<simulationsteppermethod>rk6</simulationsteppermethod>') ||
      !desktop.xml.includes('<randomseed>8447</randomseed>')) throw Error('Format 1.11 RK6/fixed seed lost');
} else {
  const generated = resolve(output, 'format111.ork');
  execFileSync('java', ['-Djava.awt.headless=true', '-Djava.util.prefs.userRoot='+resolve(output,'preferences'), '-cp', output+':'+classpath,
    'ArchiveDesktopProof', 'generate-format111', source, generated], { stdio: 'ignore' });
  execFileSync(process.execPath, [fileURLToPath(import.meta.url), resolve(output, 'format111')], {
    env: { ...process.env, ORK_PROOF_INPUT: generated }, stdio: 'inherit',
  });
}
