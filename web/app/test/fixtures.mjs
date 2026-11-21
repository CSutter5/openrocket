import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, delimiter } from 'node:path';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { importArchive } from '../../packages/ork-format/src/index.js';
import { PROOF_PRESETS } from '../../packages/ork-format/src/radius.js';
export const repo = resolve(import.meta.dirname, '../../..');
export const output = resolve(process.env.ORK_POC_OUTPUT || resolve(repo, 'web/app/build/gp'));
const classpath = process.env.ORK_PROOF_CLASSPATH?.trim();
export async function run(command, args, name) {
  const result = spawnSync(command, args, { cwd: repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  await writeFile(resolve(output, name + '.log'), (result.stdout ?? '') + (result.stderr ?? ''));
  assert.equal(result.status, 0, `${command} failed: ${resolve(output, name + '.log')}`);
}
export async function prepare() {
  assert.ok(classpath, 'Set ORK_PROOF_CLASSPATH using the documented desktop classpath task');
  await mkdir(resolve(output, 'classes'), { recursive: true });
  const source = name => resolve(repo, 'web/packages/ork-format/jvm', name + '.java');
  const engine = name => resolve(repo, 'web/engine-adapter/src/main/java', name + '.java');
  await run('javac', ['-cp', classpath, '-d', resolve(output, 'classes'), source('ArchiveDesktopProof'), source('RadiusDesktopProof'),
    source('ImportedEffectsDesktopProof'), resolve(repo, 'web/app/test/EditorDesktopProof.java'), resolve(repo, 'web/app/test/SimulationDesktopProof.java'), resolve(repo, 'web/app/test/SavedSimulationDesktopProof.java'), resolve(repo, 'web/app/test/CatalogCurveProof.java'), resolve(repo, 'web/app/test/ConfigurationDesktopProof.java'), engine('proof/ImportedFlight'), engine('proof/SavedFlightOptions'), engine('proof/ImportedRocketFlight'), engine('info/openrocket/core/file/motor/BrowserCurve'), engine('info/openrocket/core/preset/FlightPresetCatalog'), resolve(repo,'web/app/test/ImportedFlightDesktopProof.java'), resolve(repo,'web/app/test/FlightCatalogExporter.java'), engine('proof/EditorDrawing'), engine('proof/PortableLine2D'), engine('proof/PortablePoint2D'), resolve(repo, 'web/app/test/MultistageDesktopProof.java'), engine('proof/EditorStability'), engine('proof/EditorInternals'), resolve(repo, 'web/app/test/ComponentDesktopProof.java'), engine('proof/ImportedTubeProof'), engine('proof/ImportedRingProof'),
    engine('proof/ImportedDeploymentProof'), engine('proof/PortableDigest'), engine('info/openrocket/core/preset/ProofPresetCatalog'), resolve(repo, 'web/app/test/PreviewDesktopProof.java')], 'javac');
  await java('ImportedEffectsDesktopProof', ['digests'], 'digests');
  for (const kind of ['explicit', 'ring']) {
    const directory = resolve(output, kind); await mkdir(directory, { recursive: true });
    await java('ImportedEffectsDesktopProof', [kind === 'ring' ? 'generate-ring' : 'generate',
      resolve(repo, 'core/src/main/resources/datafiles/examples/A simple model rocket.ork'), directory], `generate-${kind}`);
    assert.deepEqual(JSON.parse(await readFile(resolve(directory, 'catalog.json'), 'utf8')), PROOF_PRESETS);
    const path = resolve(directory, 'G1-A.ork'), entries = unzipSync(await readFile(path));
    let xml = strFromU8(entries['rocket.ork']).replace('</openrocket>',
      '<poc:opaque xmlns:poc="urn:poc" value="keep &amp; exact"><![CDATA[<script>opaque()</script>]]></poc:opaque></openrocket>')
      .replace(/<simulation status="outdated"/g, '<simulation status="loaded"');
    // Same shared-configuration historical-series case as the existing effects proof.
    const first = (await importArchive(strToU8(xml))).parsed.simulations[0];
    xml = xml.slice(0, first.end) + xml.slice(first.start, first.end).replace('<name>', '<name>Shared configuration ') + xml.slice(first.end);
    entries['rocket.ork'] = strToU8(xml); entries['opaque/poc.bin'] = new Uint8Array([0, 255, 13, 10, 7]);
    await writeFile(path, zipSync(entries, { level: 6, mtime: new Date(1980, 0, 1) }));
  }
}
export async function java(main, args, name) {
  await run('java', ['-Djava.awt.headless=true', `-Djava.util.prefs.userRoot=${output}/preferences`,
    '-cp', resolve(output, 'classes') + delimiter + classpath, main, ...args], name);
}
