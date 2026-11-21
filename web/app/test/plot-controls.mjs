import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { importArchive } from '../../packages/ork-format/src/index.js';
import { savedSimulations } from '../src/simulation/saved.ts';
import { convertPlot, eventX, extent, fitPlotAxes, plotPoints, plotPresets, plotTypes } from '../src/simulation/plot.ts';
import { prepare, java, output, repo } from './fixtures.mjs';
import { flights } from './workspace.mjs';

await prepare();
const fixture = resolve(output, 'plot-controls.ork');
await java('SavedSimulationDesktopProof', ['generate-simple', resolve(repo, 'web/app/public/flight-ready.ork'), fixture], 'plot-generate');
const bytes = await readFile(fixture), archive = await importArchive(new Uint8Array(bytes)), saved = savedSimulations(archive)[0];
const branch = archive.parsed.simulations[0].children.find(n => n.name === 'flightdata').children.find(n => n.name === 'databranch');
const keys = branch.attributes.types.value.split(',');
const nativePoints = branch.children.filter(n => n.name === 'datapoint');
for (const [column, key] of keys.entries()) nativePoints.forEach((point, index) => {
  const raw = point.text.split(',')[column], value = Number(raw);
  assert.equal(saved.plots[0].channels[key][index], raw.trim() && Number.isFinite(value) ? value : null);
});
assert.ok(plotTypes.length > 60);assert.equal(plotPresets.length, 9);
assert.ok(Math.abs(convertPlot(9.80665, 'acceleration_z', 'G') - 1) < 1e-12);
assert.ok(Math.abs(convertPlot(273.15, 'air_temperature', '°C')) < 1e-9);
assert.ok(Math.abs(convertPlot(273.15, 'air_temperature', '°F') - 32) < 1e-9);
assert.ok(Math.abs(convertPlot(1, 'altitude', 'ft') - 1 / .3048) < 1e-12);
assert.equal(convertPlot(60, 'time', 'min'), 1);
assert.equal(convertPlot(12, 'historical custom variable', 'as recorded'), 12);
const sparse = { name: 'Sparse', points: [], channels: { time: [0, 1, 2], altitude: [7, null, 7], position_x: [0, 10, 4] } };
const row = { id: 0, type: 'altitude', unit: 'm', axis: 'Auto', color: '#0072b2', style: 'SOLID' };
assert.deepEqual(plotPoints(sparse, 'position_x', 'm', row), [[0, 7], null, [4, 7]]);
assert.equal(eventX(sparse, .5, 'position_x'), 5);assert.equal(eventX(sparse, 3, 'position_x'), null);
assert.deepEqual(extent([]), [0, 1]);assert.ok(fitPlotAxes([row], [sparse]).bounds.flat().every(Number.isFinite));

const browser = await chromium.launch({ headless: true }), errors = [], checks = [];
const report = { outcome: 'running', checks, browser: browser.version(), recordedChannels: keys.length };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const Native = Worker;window.plotFlights = [];
    window.Worker = class extends Native { constructor(url, options) { super(url, options);if (String(url).includes('simulation.worker')) this.addEventListener('message', e => { if (e.data.type === 'completed') window.plotFlights.push(e.data.result.flight); }); } };
  });
  await page.goto(process.env.ORK_POC_URL || 'http://127.0.0.1:4175');await flights(page);
  await page.getByLabel('Open local .ork').setInputFiles(fixture);await page.getByText('plot-controls.ork', { exact: true }).waitFor();
  const panel = page.getByRole('region', { name: 'Flight simulations', exact: true });
  await panel.getByRole('button', { name: 'Plot', exact: true }).click();
  const graph = page.getByRole('dialog', { name: 'Flight graph · Simple RK4', exact: true });
  assert.equal(await graph.locator('.plot-row').count(), 3);
  assert.deepEqual(await graph.locator('.plot-row select[aria-label^="Y axis type"]').evaluateAll(nodes => nodes.map(n => n.value)), ['altitude', 'velocity_z', 'acceleration_z']);
  assert.equal(await graph.locator('.flight-plot polyline[data-series=altitude]').count(), 1);
  await graph.getByLabel('X axis unit', { exact: true }).selectOption('min');
  await graph.getByRole('img', { name: 'Altitude versus time, m, min', exact: true }).waitFor();
  await graph.getByLabel('X axis unit', { exact: true }).selectOption('s');
  await graph.getByLabel('Graph altitude units', { exact: true }).selectOption('ft');
  await graph.getByLabel('Y axis unit 2', { exact: true }).selectOption('ft/s');
  await graph.getByLabel('Y axis unit 3', { exact: true }).selectOption('G');
  await graph.getByLabel('Y axis side 2', { exact: true }).selectOption('Right');
  assert.match(await graph.locator('.plot-legend').innerText(), /Vertical velocity \(ft\/s\).*Right/);
  await graph.getByLabel('Series 1 color', { exact: true }).fill('#009e73');
  await graph.getByLabel('Series 1 line style', { exact: true }).selectOption('DASHDOT');
  const altitude = graph.locator('.flight-plot polyline[data-series=altitude]');
  assert.equal(await altitude.getAttribute('stroke'), '#009e73');assert.equal(await altitude.getAttribute('stroke-dasharray'), '8.0 3.0 2.0 3.0');
  await graph.getByRole('button', { name: 'Set as default', exact: true }).first().click();
  await graph.getByRole('button', { name: 'Reset', exact: true }).first().click();
  assert.equal(await altitude.getAttribute('stroke'), '#0072b2');assert.equal(await altitude.getAttribute('stroke-dasharray'), null);
  await graph.getByRole('button', { name: 'None', exact: true }).click();assert.equal(await graph.locator('.plot-event-marker').count(), 0);
  await graph.getByRole('button', { name: 'All', exact: true }).click();assert.ok(await graph.locator('.plot-event-marker path').count() > 0);
  await graph.getByRole('radio', { name: 'Icon', exact: true }).check();assert.ok(await graph.locator('.plot-event-marker circle').count() > 0);
  await graph.getByRole('checkbox', { name: 'Motor ignition', exact: true }).uncheck();
  assert.ok(!(await graph.locator('.plot-event-marker title').allTextContents()).some(text => text.includes('Motor ignition')));
  await graph.getByLabel('Y axis type 2', { exact: true }).selectOption('mass');
  await graph.getByLabel('Y axis unit 2', { exact: true }).selectOption('kg');
  assert.ok(await graph.locator('.flight-plot polyline[data-series=mass]').count() > 0);
  checks.push('native stored columns; SI/feet/G/temperature conversions; independent units and axes; color/style/default/reset; event toggles and both marker styles');
  for (const [index, preset] of plotPresets.entries()) {
    await graph.getByLabel('Preset plot configurations', { exact: true }).selectOption(String(index));
    assert.equal(await graph.getByLabel('X axis type', { exact: true }).inputValue(), preset.x);
    assert.equal(await graph.locator('.plot-row').count(), preset.y.length);
    assert.ok((await graph.locator('.flight-plot polyline').evaluateAll(nodes => nodes.map(n => n.getAttribute('points')))).every(points => !/NaN|Infinity/.test(points)));
  }
  await graph.getByLabel('Preset plot configurations', { exact: true }).selectOption('0');
  assert.equal(await graph.getByLabel('Series 1 color', { exact: true }).inputValue(), '#009e73');
  await graph.getByLabel('X axis type', { exact: true }).selectOption('mach_number');
  assert.match(await graph.innerText(), /plotted in time order/);
  await graph.getByRole('button', { name: 'New Y axis plot type', exact: true }).click();
  assert.equal(await graph.locator('.plot-row').count(), 4);
  await graph.getByRole('button', { name: 'Remove Y axis 4', exact: true }).click();
  for (let i = 3; i < 15; i++) await graph.getByRole('button', { name: 'New Y axis plot type', exact: true }).click();
  assert.equal(await graph.getByRole('button', { name: 'New Y axis plot type', exact: true }).isDisabled(), true);
  for (let i = 15; i > 1; i--) await graph.getByRole('button', { name: `Remove Y axis ${i}`, exact: true }).click();
  assert.equal(await graph.getByRole('button', { name: 'Remove Y axis 1', exact: true }).isDisabled(), true);
  await graph.getByLabel('Preset plot configurations', { exact: true }).selectOption('0');
  await graph.getByRole('button', { name: 'Plot', exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('flight-plot')), true);
  await graph.locator('.window-content').evaluate(node => node.scrollTop = 0);
  await page.screenshot({ path: resolve(output, 'plot-controls.png') });
  for (const width of [760, 360]) {
    await page.setViewportSize({ width, height: 640 });
    assert.equal(await graph.locator('.window-content').evaluate(node => node.scrollWidth <= node.clientWidth), true, `Plot content fits ${width}px`);
  }
  await graph.getByRole('button', { name: 'Close', exact: true }).click();
  checks.push('all nine presets render finite coordinates; time-ordered non-time X axes; add/remove with 1–15 rows; Plot focus; responsive controls');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await panel.getByRole('button', { name: 'Run flight', exact: true }).click();
  await page.getByTestId('flight-status').filter({ hasText: 'Flight completed.' }).waitFor({ timeout: 60000 });
  const actual = await page.evaluate(() => window.plotFlights.at(-1));
  const reference = resolve(output, 'plot-controls-jvm.json');
  await java('SavedSimulationDesktopProof', ['reference', fixture, '0', reference], 'plot-reference');
  const expected = JSON.parse(await readFile(reference, 'utf8'));
  assert.deepEqual(Object.keys(actual.branches[0].channels), Object.keys(expected.branches[0].channels));
  for (const [key, values] of Object.entries(actual.branches[0].channels)) {
    assert.equal(values.length, actual.branches[0].series.length, key);
    assert.ok(values.every(value => value === null || Number.isFinite(value)), key);
    // The initial native state is independent of later adaptive integration differences.
    const first = expected.branches[0].channels[key][0];
    if (first != null && key !== 'computation_time') {
      assert.notEqual(values[0], null, key);
      assert.ok(Math.abs(values[0] - first) <= Math.max(1e-9, Math.abs(first) * 1e-9), key);
    }
  }
  const channels = actual.branches[0].channels;
  actual.branches[0].series.forEach((r, i) => assert.deepEqual(r, [channels.time[i], channels.altitude[i], channels.velocity_total[i], channels.acceleration_total[i]]));
  await panel.getByRole('button', { name: 'Plot', exact: true }).click();
  assert.equal(await graph.getByLabel('Series 1 color', { exact: true }).inputValue(), '#009e73');
  assert.ok(await graph.locator('.flight-plot polyline[data-series=velocity_z]').count() > 0);
  await graph.getByRole('button', { name: 'Close', exact: true }).click();
  const download = page.waitForEvent('download');await page.getByRole('button', { name: 'Download .ork', exact: true }).click();
  assert.deepEqual(await readFile(await (await download).path()), bytes);
  checks.push('browser full-channel schema/initial native values match independently loaded JVM flight; existing four columns unchanged; session defaults survive close/run; exact archive bytes retained');
  assert.deepEqual(errors, []);report.outcome = 'passed';
  console.log('Plot controls, stored channels, native browser channels and archive preservation passed.');
} catch (error) { report.outcome = 'failed';report.error = String(error);throw error; }
finally { await writeFile(resolve(output, 'plot-controls-report.json'), JSON.stringify(report, null, 2) + '\n');await browser.close(); }
