import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { componentNames, importArchive } from '../../packages/ork-format/src/index.js';
import { tubeRadiusInput } from '../../packages/ork-format/src/radius.js';
import { prepare, java, output, repo } from './fixtures.mjs';
await prepare();
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const report = { outcome: 'running', browser: browser.version(), cases: [], baseline: '33bdb6d3062a6d9ef44a00d1ff865f962136e9e9' };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.ORK_POC_URL || 'http://127.0.0.1:5173');
  async function download(name) {
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download .ork', exact: true }).click();
    const file = await event, path = resolve(output, name);
    assert.equal(await file.failure(), null); await file.saveAs(path);
    await page.getByTestId('dirty').filter({ hasText: 'No changes since' }).waitFor();
    return path;
  }
  async function select(name) { await page.getByRole('button', { name: `${name} bodytube`, exact: true }).click(); }
  async function rename(name) {
    await page.getByLabel('Component name', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Apply name', exact: true }).click();
    await page.getByRole('heading', { name, exact: true }).waitFor();
  }
  async function radius(value) {
    await page.getByLabel('BodyTube outer radius (m)', { exact: true }).fill(String(value));
    await page.getByRole('button', { name: 'Apply radius', exact: true }).click();
    await page.getByTestId('radius').filter({ hasText: String(value) }).waitFor();
  }
  async function read(path) { return importArchive(new Uint8Array(await readFile(path))); }
  async function nameOracle(original, edited, id, name, key) {
    const directory = resolve(output, `desktop-${key}`); await mkdir(directory, { recursive: true });
    await java('ArchiveDesktopProof', [original, edited, resolve(directory, 'desktop-resaved.ork'), id, name], key);
  }
  function lexical(original, edited, id, name, radiusValue) {
    const names = componentNames(edited), target = original.parsed.components.find(n => n.id === id);
    assert.deepEqual(names.map(c => c.id), componentNames(original).map(c => c.id));
    const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    let expected = original.xml.slice(0, target.nameNode.contentStart) + escape(name) + original.xml.slice(target.nameNode.contentEnd);
    if (radiusValue !== undefined) {
      const input = tubeRadiusInput(original, id);
      // Independently specify the lexical spans allowed for this growth edit.
      const radiusNode = target.children.find(n => n.name === 'radius');
      const thicknessNode = target.children.find(n => n.name === 'thickness');
      expected = expected.replace(original.xml.slice(radiusNode.start, radiusNode.end), `<radius>${radiusValue}</radius>`);
      expected = expected.replace(original.xml.slice(thicknessNode.start, thicknessNode.end), `<thickness>${input.thickness}</thickness>`);
      if (input.preset) {
        const preset = target.children.find(n => n.name === 'preset');
        expected = expected.replace(original.xml.slice(preset.start, preset.end), '');
      }
      expected = expected.replace(/<simulation status="loaded"/g, '<simulation status="outdated"');
    }
    assert.equal(edited.xml, expected, 'Only requested name/radius, preset removal and stored-result statuses may change');
    assert.deepEqual(edited.entries.filter(e => e.path !== 'rocket.ork').map(e => [e.path, e.sha256]),
      original.entries.filter(e => e.path !== 'rocket.ork').map(e => [e.path, e.sha256]));
    assert.deepEqual(edited.parsed.simulations.map(n => n.children.filter(c => c.name === 'flightdata').map(c => edited.xml.slice(c.start, c.end))),
      original.parsed.simulations.map(n => n.children.filter(c => c.name === 'flightdata').map(c => original.xml.slice(c.start, c.end))));
    assert.equal(edited.entries[0].path, 'rocket.ork');
    assert.ok(!edited.entries.some(e => e.path.includes('sidecar')));
  }
  const samplePath = resolve(repo, 'web/app/public/explicit-tube.ork'), sample = await read(samplePath);
  await page.getByRole('button', { name: 'Open explicit tube sample', exact: true }).click();
  await select('Tube');
  const originalDownload = await download('sample-original.ork');
  assert.deepEqual(await readFile(originalDownload), await readFile(samplePath));
  const sampleName = 'Local & desktop <tube>', sampleId = componentNames(sample).find(c => c.type === 'bodytube').id;
  await rename(sampleName);
  const namedSample = await download('sample-named.ork');
  await nameOracle(samplePath, namedSample, sampleId, sampleName, 'sample-name');
  await radius(0.03);
  const sampleEdit = await download('sample-edited.ork');
  lexical(sample, await read(sampleEdit), sampleId, sampleName, 0.03);
  const sampleReport = resolve(output, 'desktop-sample-radius/report.json');
  await java('RadiusDesktopProof', [namedSample, sampleEdit, sampleId, '0.03', sampleReport], 'sample-radius');
  const desktopSample = JSON.parse(await readFile(sampleReport, 'utf8'));
  assert.equal(Number(await page.getByTestId('mass').textContent()), desktopSample.after.mass);
  await page.getByLabel('Open local .ork').setInputFiles(sampleEdit); await select(sampleName);
  assert.equal(await page.getByTestId('radius').textContent(), '0.03');
  report.cases.push({ name: 'bundled-explicit', id: sampleId, nameOracle: 'passed', ...desktopSample });
  for (const kind of ['explicit', 'ring']) {
    const originalPath = resolve(output, kind, 'G1-A.ork'), original = await read(originalPath);
    const target = componentNames(original).find(c => c.type === 'bodytube'), name = `POC ${kind} & <tube>`;
    await page.getByLabel('Open local .ork').setInputFiles(originalPath); await select(target.name);
    const input = tubeRadiusInput(original, target.id);
    assert.equal(Number(await page.getByTestId('radius').textContent()), input.radius);
    // No-op must preserve original archive bytes and loaded statuses.
    await page.getByRole('button', { name: 'Apply radius', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'No change' }).waitFor();
    assert.deepEqual(await readFile(await download(`${kind}-noop.ork`)), await readFile(originalPath));
    if (kind === 'ring') {
      await page.getByLabel('BodyTube outer radius (m)', { exact: true }).fill('0.0005');
      await page.getByRole('button', { name: 'Apply radius', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'desktop reload would disable automation' }).waitFor();
      assert.equal(Number(await page.getByTestId('radius').textContent()), input.radius);
      await page.screenshot({ path: resolve(output, 'underfit-rejected.png'), fullPage: true });
      assert.deepEqual(await readFile(await download('ring-after-rejection.ork')), await readFile(originalPath));
      await java('ImportedEffectsDesktopProof', ['probe-ring-underfit', originalPath, resolve(output, 'underfit/report.json')], 'underfit-control');
    }
    await rename(name);
    const named = await download(`${kind}-named.ork`);
    lexical(original, await read(named), target.id, name);
    await nameOracle(originalPath, named, target.id, name, `${kind}-name`);
    await radius(0.035);
    const expectedMass = input.density * Math.PI * (0.035 ** 2 - (0.035 - input.thickness) ** 2) * input.length;
    assert.ok(Math.abs(Number(await page.getByTestId('mass').textContent()) - expectedMass) < 1e-12);
    assert.equal(Number(await page.getByTestId('cg').textContent()), input.length / 2);
    const details = page.locator('details.preview');
    if (!(await details.getAttribute('open') !== null)) await details.locator('summary').click();
    await page.getByRole('img', { name: /outer radius 0.035 m/ }).waitFor();
    await page.screenshot({ path: resolve(output, `${kind}-editor.png`), fullPage: true });
    const edited = await download(`${kind}-edited.ork`), reimported = await read(edited);
    lexical(original, reimported, target.id, name, 0.035);
    const desktopReportPath = resolve(output, `desktop-${kind}-radius/report.json`);
    await java('ImportedEffectsDesktopProof', [named, edited, 'setOuterRadius', target.id, '0.035', desktopReportPath], `${kind}-radius`);
    const desktop = JSON.parse(await readFile(desktopReportPath, 'utf8'));
    assert.equal(Number(await page.getByTestId('mass').textContent()), desktop.state.after.mass);
    assert.equal(desktop.fullSerializationEqual, true); assert.equal(desktop.desktopReloadEqual, true);
    await page.getByLabel('Open local .ork').setInputFiles(edited); await select(name);
    assert.equal(await page.getByTestId('radius').textContent(), '0.035');
    assert.deepEqual(await readFile(await download(`${kind}-reimported.ork`)), await readFile(edited));
    // Reopen the pinned desktop re-save in the actual app as well.
    await page.getByLabel('Open local .ork').setInputFiles(resolve(output, `desktop-${kind}-radius/desktop-resaved.ork`)); await select(name);
    assert.equal(await page.getByTestId('radius').textContent(), '0.035');
    report.cases.push({ name: kind, targetId: target.id, nameOracle: 'passed', ...desktop,
      opaqueXmlAndAttachmentsExact: true, idsAndReferencesExact: true, storedSeriesExact: true,
      attachmentHashes: original.entries.filter(e => e.path !== 'rocket.ork').map(e => ({ path: e.path, sha256: e.sha256 })),
      browserReimport: true, desktopResaveBrowserReimport: true });
  }
  assert.deepEqual(errors, []);
  report.underfit = JSON.parse(await readFile(resolve(output, 'underfit/report.json'), 'utf8'));
  report.outcome = 'passed';
  console.log(`P03 UI downloads + browser/pinned-desktop round trips passed; evidence: ${output}`);
} catch (error) { report.outcome = 'failed'; report.error = String(error); throw error; }
finally { await writeFile(resolve(output, 'roundtrip.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
