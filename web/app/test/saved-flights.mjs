import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { importArchive } from '../../packages/ork-format/src/index.js';
import { savedSimulations } from '../src/simulation/saved.ts';
import { prepare, java, output, repo } from './fixtures.mjs';
import { flights } from './workspace.mjs';
await prepare();
await java('ImportedFlightDesktopProof', ['generate', resolve(repo, 'web/app/public/flight-ready.ork'), resolve(output, 'saved-base.ork')], 'saved-base');
const fixture = resolve(output, 'saved-conditions.ork');
await java('SavedSimulationDesktopProof', ['generate', resolve(output, 'saved-base.ork'), fixture], 'saved-conditions');
await java('CatalogCurveProof', [resolve(repo, 'web/app/src/simulation/motor-index.json'), resolve(repo, 'web/app/public/motors')], 'catalog-curve-proof');
await import('./catalog-roundtrip.mjs');
const bytes = await readFile(fixture), archive = await importArchive(new Uint8Array(bytes)), rows = savedSimulations(archive);
assert.equal(rows.length, 2);assert.ok(rows.every(s => !s.reason && s.plots[0].points.length > 10));
const catalog = JSON.parse(await readFile(resolve(repo, 'web/app/src/simulation/motor-index.json'), 'utf8'));
const motor = catalog.motors.find(m => m.manufacturer === 'AeroTech' && m.diameter > .05 && m.diameter < .06 && m.impulse > 700 && m.impulse < 1000 && !['J135W', 'J800T'].includes(m.designation));
assert.ok(motor, 'Independent catalog motor outside the two old pinned references');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const report = { outcome: 'running', comparisons: [], checks: [] };
function compare(expected, actual, name) {
  assert.equal(actual.rk6, expected.rk6);assert.equal(actual.warningCount, expected.warningCount);
  const normalized = warnings => warnings.map(s => s.replace('[Warning.Warning.', '[Warning.'));
  assert.deepEqual(normalized(actual.warnings), normalized(expected.warnings));
  for (const key of ['mass', 'cg', 'cp']) assert.ok(Math.abs(expected[key] - actual[key]) < 1e-10);
  function same(a, b) { if (typeof a === 'number') assert.ok(Number.isFinite(b) && Math.abs(a - b) < 1e-10);else if (a && typeof a === 'object') { assert.deepEqual(Object.keys(a), Object.keys(b));for (const key of Object.keys(a)) same(a[key], b[key]); } else assert.equal(a, b); }
  same(expected.inputs, actual.inputs);
  assert.equal(actual.series.length, expected.series.length);assert.equal(actual.events.length, expected.events.length);
  const limits = [.001, .12, .25, 3], summaryLimits = [.001, .000001, .001, .001], max = [0, 0, 0, 0];
  expected.series.forEach((row, i) => row.forEach((value, j) => { const error = Math.abs(actual.series[i][j] - value);assert.ok(Number.isFinite(error) && error <= limits[j], `${name} row ${i}/${j}: ${error}`);max[j] = Math.max(max[j], error); }));
  expected.summary.forEach((value, j) => assert.ok(Math.abs(actual.summary[j] - value) <= summaryLimits[j], `${name} summary ${j}`));
  expected.events.forEach(([type, time], i) => { assert.equal(actual.events[i][0], type);assert.ok(Math.abs(actual.events[i][1] - time) <= .001); });
  report.comparisons.push({ name, rows: actual.series.length, maxSeriesErrors: max, limits, summaryLimits });
}
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { const Native = Worker;window.flights = [];window.Worker = class extends Native { constructor(url, options) { super(url, options);if (String(url).includes('simulation.worker')) this.addEventListener('message', e => window.flights.push(e.data)); } }; });
  await page.goto(process.env.ORK_POC_URL || 'http://127.0.0.1:4174');await flights(page);
  await page.getByLabel('Open local .ork').setInputFiles(fixture);await page.getByText('saved-conditions.ork', { exact: true }).waitFor();
  const table = page.locator('.simulation-table');
  for (let i = 0; i < 2; i++) {
    const row = table.getByRole('row').filter({ has: page.getByRole('button', { name: rows[i].name, exact: true }) });
    assert.ok((await row.innerText()).includes(i ? 'J800T' : 'J135W'));
    assert.ok((await row.innerText()).includes(rows[i].summary[0].toFixed(2)));
  }
  await table.getByRole('button', { name: rows[0].name, exact: true }).dblclick();
  const graph = page.getByRole('dialog', { name: `Flight graph · ${rows[0].name}`, exact: true });
  await graph.getByRole('img', { name: /Altitude versus time/ }).waitFor();
  assert.equal((await graph.locator('polyline[data-series=altitude]').getAttribute('points')).split(' ').length, rows[0].plots[0].points.length);
  await graph.getByRole('button', { name: `Close Flight graph · ${rows[0].name}`, exact: true }).click();
  report.checks.push('stored motor configuration and summary columns; double-click opens the exact stored graph');
  async function runRow(index, path = fixture, key = `saved-${index}`) {
    await table.getByRole('button', { name: rows[index].name, exact: true }).click();
    await page.getByRole('button', { name: /^(Run|Restart) flight$/, exact: true }).click();
    if (index === 1) { await page.getByTestId('flight-status').filter({ hasText: 'Running flight' }).waitFor();await table.getByRole('button', { name: rows[0].name, exact: true }).click(); }
    await page.getByTestId('flight-status').filter({ hasText: 'Flight completed.' }).waitFor({ timeout: 60000 });
    const result = await page.evaluate(() => window.flights.filter(m => m.type === 'completed').at(-1).result);
    assert.equal(result.provenance.configurationId, rows[index].configurationId);assert.equal(result.provenance.seed, 197 + index);
    assert.equal(result.provenance.integrator, index ? 'RK6' : 'RK4');
    const expectedFile = resolve(output, key + '-jvm.json');
    await java('SavedSimulationDesktopProof', ['reference', path, String(index), expectedFile], key + '-reference');
    compare(JSON.parse(await readFile(expectedFile, 'utf8')), result.flight, key);
    return result;
  }
  const first = await runRow(0), second = await runRow(1);
  assert.notEqual(first.provenance.simulationId, second.provenance.simulationId);
  await table.getByRole('button', { name: rows[0].name, exact: true }).click();
  assert.ok((await table.getByRole('row').filter({ hasText: rows[0].name }).innerText()).includes(first.flight.summary[0].toFixed(2)));
  await table.getByRole('button', { name: rows[1].name, exact: true }).dblclick();
  const secondGraph = page.getByRole('dialog', { name: `Flight graph · ${rows[1].name}`, exact: true });
  assert.equal((await secondGraph.locator('polyline[data-series=altitude]').getAttribute('points')).split(' ').length, second.flight.series.length);
  await secondGraph.press('Escape');
  async function download() { const event = page.waitForEvent('download');await page.getByRole('button', { name: 'Download .ork', exact: true }).click();return readFile(await (await event).path()); }
  assert.deepEqual(await download(), bytes);
  report.checks.push('both saved launch/weather configurations and steppers match desktop; results stay with their own rows; runs retain archive bytes');

  await page.getByRole('tab', { name: 'Motors & Configuration', exact: true }).click();
  await page.getByRole('button', { name: 'Select motor', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Select motor', exact: true });
  await picker.getByLabel('Search motors', { exact: true }).fill(motor.designation);
  const target = picker.getByRole('radio', { name: `${motor.manufacturer} ${motor.designation} ${motor.digest.slice(0, 8)}`, exact: true }).first();
  await target.check();
  await picker.getByLabel('Ejection delay (seconds or none)', { exact: true }).fill('9');
  await page.route(`**/motors/${motor.sha256}.rse`, route => route.fulfill({ status: 200, body: 'invalid curve bytes' }));
  await picker.getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Motor catalog curve hash mismatch' }).waitFor();
  assert.deepEqual(await download(), bytes);
  await page.unroute(`**/motors/${motor.sha256}.rse`);
  await picker.getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Motor assigned to the selected configuration.' }).waitFor();
  await page.getByTestId('dirty').filter({ hasText: 'Changed since' }).waitFor();
  const editedBytes = await download(), edited = await importArchive(new Uint8Array(editedBytes)), editedPath = resolve(output, 'catalog-assigned.ork');await writeFile(editedPath, editedBytes);
  const mount = edited.parsed.components.find(n => n.children.some(c => c.name === 'motormount'));
  const assignment = mount.children.find(n => n.name === 'motormount').children.find(n => n.name === 'motor' && n.attributes.configid.value === rows[0].configurationId);
  assert.equal(assignment.children.find(n => n.name === 'digest').text, motor.digest);
  assert.equal(assignment.children.find(n => n.name === 'delay').text, '9');
  assert.equal(edited.entries.find(e => e.path === `thrustcurves/${motor.digest}.rse`).sha256, motor.sha256);
  const editedRows = savedSimulations(edited);assert.equal(editedRows[0].status, 'outdated');assert.equal(editedRows[1].status, rows[1].status);
  assert.deepEqual(editedRows.map(r => r.options), rows.map(r => r.options));assert.deepEqual(editedRows.map(r => r.plots), rows.map(r => r.plots));
  for (const entry of archive.entries.filter(e => e.path !== 'rocket.ork')) assert.equal(edited.entries.find(e => e.path === entry.path).sha256, entry.sha256);
  await java('SavedSimulationDesktopProof', ['assigned', editedPath, rows[0].configurationId, mount.id, motor.digest, motor.designation, '9', resolve(output, 'catalog-desktop-resaved.ork')], 'catalog-desktop-reopen');
  await flights(page);await runRow(0, editedPath, 'catalog-assigned');
  report.checks.push('all 1942 catalog options exported; a non-pinned motor assignment persists with its curve and delay, affects only linked stored statuses, reopens in desktop and reruns against the JVM');

  const entries = unzipSync(bytes), xml = strFromU8(entries['rocket.ork']);
  const bad = zipSync({ ...entries, 'rocket.ork': strToU8(xml.replace('<windmodeltype>Average</windmodeltype>', '<windmodeltype>MultiLevel</windmodeltype>')) });
  await page.getByLabel('Open local .ork').setInputFiles({ name: 'unsupported-saved.ork', mimeType: 'application/octet-stream', buffer: Buffer.from(bad) });
  await page.getByText('unsupported-saved.ork', { exact: true }).waitFor();
  await table.getByRole('button', { name: rows[0].name, exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'windmodeltype=MultiLevel is not supported' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Run flight', exact: true }).isDisabled(), true);
  assert.deepEqual(await download(), Buffer.from(bad));
  report.checks.push('unsupported saved weather refuses visibly with no substituted settings or changed archive');
  const missing = zipSync({ ...entries, 'rocket.ork': strToU8(xml.replace(`<configid>${rows[0].configurationId}</configid>`, '<configid>99999999-0000-4000-8000-000000000000</configid>')) });
  await page.getByLabel('Open local .ork').setInputFiles({ name: 'missing-configuration.ork', mimeType: 'application/octet-stream', buffer: Buffer.from(missing) });
  await page.getByText('missing-configuration.ork', { exact: true }).waitFor();
  await table.getByRole('button', { name: rows[0].name, exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Unknown selected flight configuration' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Run flight', exact: true }).isDisabled(), true);
  assert.deepEqual(await download(), Buffer.from(missing));
  report.checks.push('unresolved saved configuration refuses without using the archived default');
  assert.deepEqual(errors, []);report.outcome = 'passed';
  await page.screenshot({ path: resolve(output, 'saved-simulation-list.png'), fullPage: true });
  console.log('Saved simulation selection, graphs, settings/JVM comparisons and complete catalog assignment passed.');
} catch (error) { report.outcome = 'failed';report.error = String(error);throw error; }
finally { await writeFile(resolve(output, 'saved-flights-report.json'), JSON.stringify(report, null, 2) + '\n');await browser.close(); }
