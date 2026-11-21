import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, delimiter } from 'node:path';
import { chromium } from 'playwright';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import { importArchive } from '../../packages/ork-format/src/index.js';
import { importedInput } from '../src/simulation/imported.ts';
import { resolveCatalogMotors } from '../src/simulation/motor-catalog.ts';
import { flightSupport } from '../src/simulation/input.ts';
import { prepare, java, run, output, repo } from './fixtures.mjs';
import { flights } from './workspace.mjs';

await prepare();
await run('javac', ['-cp', output + '/classes' + delimiter + process.env.ORK_PROOF_CLASSPATH, '-d', output + '/classes', resolve(repo, 'web/app/test/RailButtonPresetDesktopProof.java')], 'rail-button-preset-javac');
const fixture = resolve(output, 'rail-button-preset.ork');
await java('RailButtonPresetDesktopProof', ['generate', resolve(repo, 'core/src/main/resources/datafiles/examples/Two stage high power rocket.ork'), fixture], 'rail-button-preset-generate');
const originalFetch = globalThis.fetch;
globalThis.fetch = async path => new Response(await readFile(resolve(repo, 'web/app/public' + path)));
const browser = await chromium.launch({ headless: true });
const report = { outcome: 'running', browser: browser.version(), cases: [], checks: [] }, errors = [];
let page;
function near(actual, expected, tolerance = 1e-10, label = '') {
  if (typeof expected === 'number') assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
  else if (Array.isArray(expected)) { assert.equal(actual.length, expected.length, label);expected.forEach((value, i) => near(actual[i], value, tolerance, label + '/' + i)); }
  else if (expected && typeof expected === 'object') for (const key of Object.keys(expected)) near(actual[key], expected[key], tolerance, label + '/' + key);
  else assert.equal(actual, expected, label);
}
function compareFlight(actual, expected) {
  near(actual.inputs, expected.inputs);near(actual.mass, expected.mass);near(actual.cg, expected.cg);near(actual.cp, expected.cp);
  assert.equal(actual.warningCount, expected.warningCount);
  const summaryLimits = [.001, .000001, .001, .001], limits = [.001, .12, .25, 3], maximum = [0, 0, 0, 0];
  expected.summary.forEach((value, i) => near(actual.summary[i], value, summaryLimits[i], 'summary/' + i));
  assert.equal(actual.branches.length, expected.branches.length);
  expected.branches.forEach((branch, i) => {
    const candidate = actual.branches[i];assert.equal(candidate.name, branch.name);near(candidate.events, branch.events, .001, 'events');
    assert.equal(candidate.series.length, branch.series.length);
    branch.series.forEach((row, j) => row.forEach((value, k) => {
      near(candidate.series[j][k], value, limits[k], `branch ${i} row ${j}/${k}`);
      if (value !== null) maximum[k] = Math.max(maximum[k], Math.abs(candidate.series[j][k] - value));
    }));
  });
  return { maximum, limits, summaryErrors: actual.summary.map((value, i) => Math.abs(value - expected.summary[i])), summaryLimits };
}
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const Native = Worker;window.views = [];window.results = [];
    window.Worker = class extends Native { constructor(url, options) { super(url, options);this.addEventListener('message', ({ data }) => {
      if (data.result?.view) window.views.push(data.result.view);if (data.type === 'completed') window.results.push(data.result);
    }); } };
  });
  await page.goto(process.env.ORK_POC_URL || 'http://127.0.0.1:4180');
  const view = () => page.evaluate(() => window.views.at(-1));
  async function load(bytes, name) {
    const version = await page.evaluate(() => window.views.length);
    await page.getByLabel('Open local .ork').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
    await page.waitForFunction(version => window.views.length > version, version);
    await page.getByText(name, { exact: true }).waitFor();
  }
  async function download() {
    const pending = page.waitForEvent('download');await page.getByRole('button', { name: 'Download .ork', exact: true }).click();return readFile(await (await pending).path());
  }
  async function runRow(row) {
    await flights(page);await page.locator('.simulation-table').getByRole('button', { name: row.name, exact: true }).click();
    assert.equal(await page.getByRole('button', { name: /^(Run|Restart) flight$/ }).isEnabled(), true);
    const count = await page.evaluate(() => window.results.length);
    await page.getByRole('button', { name: /^(Run|Restart) flight$/ }).click();
    await page.waitForFunction(count => window.results.length > count || document.querySelector('[data-testid=flight-status]')?.textContent.includes('failed'), count, { timeout: 60000 });
    assert.equal(await page.getByTestId('flight-status').innerText(), 'Flight completed.');return page.evaluate(() => window.results.at(-1).flight);
  }
  for (const [path, registered] of [[fixture, true], ...(process.argv[2] ? [[resolve(process.argv[2]), false]] : [])]) {
    const bytes = await readFile(path), archive = await importArchive(new Uint8Array(bytes));await resolveCatalogMotors(archive);
    await load(bytes, path.split('/').at(-1));
    const initial = await view();assert.equal(initial.stability.reason, undefined);assert.equal(initial.drawing.error, undefined);
    assert.equal(initial.stages.length, 2);assert.ok(initial.drawing.polygons.length > 0);
    const configs = registered ? initial.flightConfigurations.filter(c => c.isDefault) : initial.flightConfigurations;
    for (const configuration of configs) {
      await page.locator('#view-configuration').selectOption(configuration.id);await page.waitForFunction(id => window.views.at(-1).flightConfigurationId === id, configuration.id);
      const current = await view(), modelPath = resolve(output, `rail-button-${configuration.id}.txt`), prefix = resolve(output, `rail-button-${configuration.id}`);
      await writeFile(modelPath, importedInput(archive, configuration.id).model);
      const row = current.simulations.find(s => s.configurationId === configuration.id);assert.ok(row && row.support.supported && !row.reason);
      let expectedPreview, expectedFlight;
      if (registered) {
        await java('RailButtonPresetDesktopProof', ['reference', path, modelPath, prefix], 'rail-button-preset-reference');
        expectedPreview = JSON.parse(await readFile(prefix + '-preview.json', 'utf8'));expectedFlight = JSON.parse(await readFile(prefix + '-flight.json', 'utf8'));
      } else {
        await java('RailButtonPresetDesktopProof', ['user-model', path, modelPath, prefix], `rail-button-example-model-${configuration.id}`);
        await java('SavedSimulationDesktopProof', ['reference', path, String(current.simulations.indexOf(row)), prefix + '-flight.json'], `rail-button-example-flight-${configuration.id}`);
        expectedPreview = JSON.parse(await readFile(prefix + '-preview.json', 'utf8'));expectedFlight = JSON.parse(await readFile(prefix + '-flight.json', 'utf8'));
      }
      for (const key of ['cg', 'cp', 'length', 'diameter', 'massWithoutMotors', 'massWithMotors', 'caliber', 'aerodynamicLength']) near(current.stability[key], expectedPreview[key], 1e-10, key);
      near(current.drawing.polygons, expectedPreview.exterior.polygons);near(current.drawing.internals, expectedPreview.internals);
      const actual = await runRow(row), differences = compareFlight(actual, expectedFlight);assert.equal(actual.branches.length, 2);
      report.cases.push({ source: registered ? 'owned registered-preset fixture' : 'local user example', configuration: configuration.id, differences });
    }
    assert.deepEqual(await download(), bytes, 'preset metadata, stored results, motor curves and assets remain byte-identical');
    await page.getByRole('tab', { name: 'Rocket design', exact: true }).click();
    await page.screenshot({ path: resolve(output, registered ? 'rail-button-preset.png' : 'rail-button-user-example.png') });
  }
  report.checks.push('complete preset-backed rail-button state renders, has native CG/CP/geometry and runs both stages; full native physical serialization and preset-derived mass/CD overrides agree; unchanged downloads remain byte-identical');
  const sourceBytes = await readFile(fixture), archive = await importArchive(new Uint8Array(sourceBytes)), entries = unzipSync(sourceBytes);
  const button = archive.parsed.components.find(n => n.name === 'railbutton'), preset = button.children.find(n => n.name === 'preset'), height = button.children.find(n => n.name === 'height'), mass = button.children.find(n => n.name === 'overridemass');
  const remove = node => archive.xml.slice(0, node.start) + archive.xml.slice(node.end);
  const latePreset = remove(preset).replace('</railbutton>', archive.xml.slice(preset.start, preset.end) + '</railbutton>');
  for (const [name, xml] of [['missing-height', remove(height)], ['missing-mass', remove(mass)], ['wrong-type', archive.xml.replace('type="RAIL_BUTTON"', 'type="NOSE_CONE"')], ['late-preset', latePreset]]) {
    const bytes = zipSync({ ...entries, 'rocket.ork': strToU8(xml) }), rejected = await importArchive(bytes);assert.equal(flightSupport(rejected).supported, false);
    await load(bytes, name + '.ork');const current = await view();assert.equal(current.flightSupport.supported, false);
    assert.match(current.drawing.error, /^Drawing unavailable:/);assert.ok(!current.drawing.error.includes('one direct axial stage'));
    await flights(page);assert.equal(await page.getByRole('button', { name: 'Run flight', exact: true }).isDisabled(), true);assert.deepEqual(await download(), Buffer.from(bytes));
  }
  report.checks.push('missing physical fields, invalid preset type and a late preset refuse with the actual reason, disabled simulation and exact preserved bytes');
  assert.deepEqual(errors, []);report.outcome = 'passed';console.log('Rail-button preset import passed: native physical state, two-stage browser flights, exact archives and explicit refusals.');
} catch (error) {
  report.outcome = 'failed';report.error = String(error);await page?.screenshot({ path: resolve(output, 'rail-button-preset-failure.png') });
  await writeFile(resolve(output, 'rail-button-preset-failure.txt'), await page?.locator('body').innerText() ?? 'No page');throw error;
} finally {
  globalThis.fetch = originalFetch;await writeFile(resolve(output, 'rail-button-preset-report.json'), JSON.stringify(report, null, 2) + '\n');await browser.close();
}
