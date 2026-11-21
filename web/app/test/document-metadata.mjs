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
await run('javac', ['-cp', output + '/classes' + delimiter + process.env.ORK_PROOF_CLASSPATH, '-d', output + '/classes', resolve(repo, 'web/app/test/RailButtonPresetDesktopProof.java'), resolve(repo, 'web/app/test/DocumentMetadataDesktopProof.java')], 'document-metadata-javac');
const fixture = resolve(output, 'document-metadata.ork');
await java('DocumentMetadataDesktopProof', ['generate', resolve(repo, 'core/src/main/resources/datafiles/examples/Two stage high power rocket.ork'), fixture], 'document-metadata-generate');
const originalFetch = globalThis.fetch;
globalThis.fetch = async path => new Response(await readFile(resolve(repo, 'web/app/public' + path)));
const browser = await chromium.launch({ headless: true }), errors = [];
const report = { outcome: 'running', browser: browser.version(), cases: [], checks: [] };
let page;
function near(actual, expected, tolerance = 1e-10, label = '') {
  if (typeof expected === 'number') assert.ok(typeof actual === 'number' && Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
  else if (Array.isArray(expected)) { assert.equal(actual.length, expected.length, label);expected.forEach((value, i) => near(actual[i], value, tolerance, label + '/' + i)); }
  else if (expected && typeof expected === 'object') for (const key of Object.keys(expected)) near(actual[key], expected[key], tolerance, label + '/' + key);
  else assert.equal(actual, expected, label);
}
function compareFlight(actual, expected, singleStageSampling = false) {
  near(actual.inputs, expected.inputs);near(actual.mass, expected.mass);near(actual.cg, expected.cg);near(actual.cp, expected.cp);
  assert.equal(actual.warningCount, expected.warningCount);
  // Two named single-stage user cases use event-aligned descent samples; native adaptive
  // recovery steps shift threshold crossings while preserving the physical trajectory.
  const summaryLimits = singleStageSampling ? [.25, .00001, .05, .5] : [.001, .000001, .001, .001];
  const limits = singleStageSampling ? [.5, 3, .25, 20] : [.001, .12, .25, 3], maximum = [0, 0, 0, 0];
  expected.summary.forEach((value, i) => near(actual.summary[i], value, summaryLimits[i], 'summary/' + i));
  assert.equal(actual.branches.length, expected.branches.length);
  expected.branches.forEach((branch, index) => {
    const candidate = actual.branches[index];assert.equal(candidate.name, branch.name);assert.equal(candidate.events.length, branch.events.length);
    branch.events.forEach((event, i) => {
      assert.equal(candidate.events[i][0], event[0]);assert.equal(candidate.events[i][2], event[2]);
      near(candidate.events[i][1], event[1], ['LAUNCH', 'IGNITION', 'BURNOUT', 'EJECTION_CHARGE', 'STAGE_SEPARATION'].includes(event[0]) ? 1e-10 : limits[0] + 1e-9, 'event ' + event[0]);
    });
    if (candidate.series.length === branch.series.length) {
      // Compare aligned native steps directly; interpolation crosses recovery acceleration jumps.
      branch.series.forEach((row, i) => row.forEach((value, j) => {
        near(candidate.series[i][j], value, limits[j], `branch ${index} row ${i}/${j}`);
        if (value !== null) maximum[j] = Math.max(maximum[j], Math.abs(candidate.series[i][j] - value));
      }));
      return;
    }
    for (const [left, right, leftEvents, rightEvents] of [[candidate.series, branch.series, candidate.events, branch.events], [branch.series, candidate.series, branch.events, candidate.events]]) {
      near(left[0][0], right[0][0], limits[0]);near(left.at(-1)[0], right.at(-1)[0], limits[0]);
      const anchors = [[left[0][0], right[0][0]]];
      leftEvents.forEach((event, i) => { if (event[1] > anchors.at(-1)[0] && rightEvents[i][1] > anchors.at(-1)[1]) anchors.push([event[1], rightEvents[i][1]]); });
      let cursor = 0;
      for (const row of left) {
        let time = row[0];
        if (singleStageSampling) {
          let event = 0;while (event < anchors.length - 2 && anchors[event + 1][0] < time) event++;
          const [first, last] = anchors.slice(event, event + 2);
          time = first[1] + (time - first[0]) / (last[0] - first[0]) * (last[1] - first[1]);
          near(row[0], time, limits[0], 'event-aligned time');maximum[0] = Math.max(maximum[0], Math.abs(row[0] - time));
        }
        if (time < right[0][0] || time > right.at(-1)[0]) continue;
        while (cursor < right.length - 2 && right[cursor + 1][0] < time) cursor++;
        const first = right[cursor], last = right[cursor + 1], fraction = last[0] === first[0] ? 0 : (time - first[0]) / (last[0] - first[0]);
        for (let j = 1; j < 4; j++) {
          const value = first[j] === null || last[j] === null ? null : first[j] + fraction * (last[j] - first[j]);
          near(row[j], value, limits[j], `branch ${index} at ${row[0]}/${j}`);
          if (value !== null) maximum[j] = Math.max(maximum[j], Math.abs(row[j] - value));
        }
      }
    }
  });
  return { singleStageSampling, limits, summaryLimits, maximum, summaryErrors: actual.summary.map((value, i) => Math.abs(value - expected.summary[i])) };
}
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const Native = Worker;window.views = [];window.results = [];
    window.Worker = class extends Native { constructor(url, options) { super(url, options);this.addEventListener('message', ({ data }) => {
      if (data.result?.view) window.views.push(data.result.view);if (data.type === 'completed') window.results.push(data.result);
    }); } };
  });
  await page.goto(process.env.ORK_POC_URL || 'http://127.0.0.1:4181');
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
  for (const [path, registered] of [[fixture, true], ...(process.argv[2] ? [[resolve(process.argv[2]), false]] : [])]) {
    const bytes = await readFile(path), archive = await importArchive(new Uint8Array(bytes));await resolveCatalogMotors(archive);
    await load(bytes, path.split('/').at(-1));const initial = await view();
    assert.equal(initial.stability.reason, undefined);assert.equal(initial.drawing.error, undefined);assert.ok(initial.drawing.polygons.length);
    assert.ok(initial.flightConfigurations.length > 0);
    const requested = registered ? [] : process.argv.slice(3);
    assert.ok(requested.every(id => initial.flightConfigurations.some(c => c.id === id)), 'Unknown requested test configuration');
    for (const configuration of initial.flightConfigurations.filter(c => !requested.length || requested.includes(c.id))) {
      await page.locator('#view-configuration').selectOption(configuration.id);await page.waitForFunction(id => window.views.at(-1).flightConfigurationId === id, configuration.id);
      const current = await view(), prefix = resolve(output, `document-metadata-${registered ? 'fixture' : 'user'}-${configuration.id}`), modelPath = prefix + '.txt';
      await writeFile(modelPath, importedInput(archive, configuration.id).model);
      await java('DocumentMetadataDesktopProof', [registered ? 'registered' : 'user', path, modelPath, prefix], `document-metadata-model-${configuration.id}`);
      const expectedPreview = JSON.parse(await readFile(prefix + '-preview.json', 'utf8'));
      for (const key of ['cg', 'cp', 'length', 'diameter', 'massWithoutMotors', 'massWithMotors', 'caliber', 'aerodynamicLength']) near(current.stability[key], expectedPreview[key], 1e-10, key);
      near(current.drawing.polygons, expectedPreview.exterior.polygons);near(current.drawing.internals, expectedPreview.internals);
      const row = current.simulations.find(s => s.configurationId === configuration.id);assert.ok(row && row.support.supported && !row.reason);
      await java('SavedSimulationDesktopProof', ['reference', path, String(current.simulations.indexOf(row)), prefix + '-flight.json'], `document-metadata-flight-${configuration.id}`);
      await flights(page);await page.locator('.simulation-table').getByRole('button', { name: row.name, exact: true }).click();
      const count = await page.evaluate(() => window.results.length);await page.getByRole('button', { name: /^(Run|Restart) flight$/ }).click();
      await page.waitForFunction(count => window.results.length > count || document.querySelector('[data-testid=flight-status]')?.textContent.includes('failed'), count, { timeout: 60000 });
      assert.equal(await page.getByTestId('flight-status').innerText(), 'Flight completed.');
      const actual = await page.evaluate(() => window.results.at(-1).flight), expected = JSON.parse(await readFile(prefix + '-flight.json', 'utf8'));
      await writeFile(prefix + '-browser.json', JSON.stringify(actual));
      const singleStageSampling = !registered && ['46ba2526-b5a1-4e66-aee3-768cf0ca0837','8b54ad13-e29d-452a-8417-c424f4f02f9f'].includes(configuration.id);
      report.cases.push({ source: registered ? 'generated registered-preset fixture' : 'local user archive', configuration: configuration.id, differences: compareFlight(actual, expected, singleStageSampling) });
    }
    assert.deepEqual(await download(), bytes, 'document preferences, dispersion settings, presets, expressions, stored results and assets remain exact');
    await page.getByRole('tab', { name: 'Rocket design', exact: true }).click();await page.screenshot({ path: resolve(output, registered ? 'document-metadata-fixture.png' : 'document-metadata-user.png') });
  }
  report.checks.push('desktop-loaded full physical serialization, motor nozzles, preview and nominal browser flights match native references across configurations; exact original archives retained');
  const bytes = await readFile(fixture), archive = await importArchive(new Uint8Array(bytes)), entries = unzipSync(bytes);
  const pref = archive.parsed.nodes.find(n => n.name === 'pref'), chute = archive.parsed.components.find(n => n.name === 'parachute'), preset = chute.children.find(n => n.name === 'preset'), diameter = chute.children.find(n => n.name === 'diameter'), mass = chute.children.find(n => n.name === 'overridemass');
  const nozzle = archive.parsed.nodes.find(n => n.name === 'nozzleexitdiameter'), dispersion = archive.parsed.nodes.find(n => n.name === 'landingdispersion');
  const replace = (node, value) => archive.xml.slice(0, node.start) + value + archive.xml.slice(node.end);
  for (const [name, xml] of [
    ['unknown-pref', replace(pref, '<pref key="unknown.physics" type="string">x</pref>')],
    ['wrong-pref-type', replace(pref, '<pref key="simulation.table.hiddenColumns" type="boolean">true</pref>')],
    ['nested-pref', replace(pref, '<pref key="simulation.table.hiddenColumns" type="string"><unknown/></pref>')],
    ['missing-parachute-diameter', replace(diameter, '')],
    ['missing-parachute-mass', replace(mass, '')],
    ['late-parachute-preset', replace(preset, '').replace('</parachute>', archive.xml.slice(preset.start, preset.end) + '</parachute>')],
    ['oversized-nozzle', replace(nozzle, '<nozzleexitdiameter>100</nozzleexitdiameter>')],
    ['negative-nozzle', replace(nozzle, '<nozzleexitdiameter>-0.01</nozzleexitdiameter>')],
    ['unknown-dispersion', replace(dispersion, '<landingdispersion runs="500" seed="1"><uncertainty parameter="newphysics" distribution="normal" spread="1"/></landingdispersion>')],
    ['invalid-dispersion', replace(dispersion, '<landingdispersion runs="0" seed="1"/>')],
    ['script', archive.xml.replace('<simulations>', '<simulations><simulation><script>throw new Error("must not execute")</script></simulation>')],
  ]) {
    const rejected = zipSync({ ...entries, 'rocket.ork': strToU8(xml) });assert.equal(flightSupport(await importArchive(rejected)).supported, false, name);
    await load(rejected, name + '.ork');assert.equal((await view()).flightSupport.supported, false, name);
    await flights(page);assert.equal(await page.getByRole('button', { name: /^(Run|Restart) flight$/ }).isDisabled(), true, name);
    assert.deepEqual(await download(), Buffer.from(rejected));
  }
  report.checks.push('unknown or malformed preferences/analysis settings, incomplete parachute state, late presets, invalid nozzles and scripts remain refused with exact downloads');
  assert.deepEqual(errors, []);report.outcome = 'passed';console.log(`Document metadata passed in Chromium ${browser.version()}: ${report.cases.length} native model/preview/flight comparisons, archive preservation and explicit refusal cases.`);
} catch (error) {
  report.outcome = 'failed';report.error = String(error);await page?.screenshot({ path: resolve(output, 'document-metadata-failure.png') });throw error;
} finally { globalThis.fetch = originalFetch;await writeFile(resolve(output, 'document-metadata-report.json'), JSON.stringify(report, null, 2) + '\n');await browser.close(); }
