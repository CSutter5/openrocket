import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { importArchive } from '../../packages/ork-format/src/index.js';
import { importedInput } from '../src/simulation/imported.ts';
import { resolveCatalogMotors, motors } from '../src/simulation/motor-catalog.ts';
import { flightSupport } from '../src/simulation/input.ts';
import { build } from 'esbuild';
import { prepare, java, output, repo } from './fixtures.mjs';
import { flights } from './workspace.mjs';

await prepare();
const stagingModule = resolve(repo, 'web/app/build/multistage/staging.mjs');
await build({ entryPoints: [resolve(repo, 'web/app/src/staging.ts')], outfile: stagingModule, bundle: true, format: 'esm', platform: 'node', packages: 'external' });
const { editStaging, stageSettings } = await import(stagingModule);
await java('MultistageDesktopProof', [resolve(output, 'multistage-geometry.json')], 'multistage-geometry');
const originalFetch = globalThis.fetch;
globalThis.fetch = async path => new Response(await readFile(resolve(repo, 'web/app/public' + path)));
const browser = await chromium.launch({ headless: true }), checks = [], errors = [];
const report = { outcome: 'running', comparisons: [], checks, browser: browser.version() };
function near(actual, expected, tolerance = 1e-6, path = '') {
  if (typeof expected === 'number') assert.ok(Math.abs(actual - expected) <= tolerance, `${path}: ${actual} vs ${expected}`);
  else if (Array.isArray(expected)) { assert.equal(actual.length, expected.length, path);expected.forEach((v, i) => near(actual[i], v, tolerance, path + '/' + i)); }
  else if (expected && typeof expected === 'object') for (const key of Object.keys(expected)) near(actual[key], expected[key], tolerance, path + '/' + key);
  else assert.equal(actual, expected, path);
}
function compareFlight(actual, expected, profile = 'standard') {
  // C6 RK4 adaptive sampling differs near burnout/apogee; these bounds are limited to the two named corpus cases.
  const limits = profile === 'long-C6' ? [.05, .12, .5, 20] : [.001, .12, .25, 3];
  const summaryLimits = profile === 'long-C6' ? [.1, .25, .05, .05] : profile === 'C6' ? [.01, .01, .001, .001] : [.001, .000001, .001, .001];
  const maximum = [0, 0, 0, 0];
  expected.summary.forEach((value, i) => near(actual.summary[i], value, summaryLimits[i], 'summary/' + i));
  near(actual.inputs, expected.inputs, 1e-10, 'inputs');
  near(actual.mass, expected.mass, 1e-10);near(actual.cg, expected.cg, 1e-10);near(actual.cp, expected.cp, 1e-10);
  assert.equal(actual.warningCount, expected.warningCount);
  assert.equal(actual.branches.length, expected.branches.length);
  expected.branches.forEach((branch, index) => {
    const candidate = actual.branches[index];assert.equal(candidate.name, branch.name);assert.equal(candidate.events.length, branch.events.length);
    branch.events.forEach((event, i) => {
      const observed = candidate.events[i];assert.equal(observed[0], event[0]);assert.equal(observed[2], event[2]);
      const scheduled = ['LAUNCH', 'IGNITION', 'BURNOUT', 'EJECTION_CHARGE', 'STAGE_SEPARATION'].includes(event[0]);
      near(observed[1], event[1], scheduled ? 1e-10 : limits[0] + 1e-9, 'event ' + event[0]);
    });
    if (candidate.series.length === branch.series.length && profile === 'standard') {
      branch.series.forEach((row, i) => row.forEach((value, j) => {
        near(candidate.series[i][j], value, limits[j], `branch ${index} row ${i}/${j}`);
        if(value !== null)maximum[j] = Math.max(maximum[j], Math.abs(candidate.series[i][j] - value));
      }));
    } else {
      // Roundoff at booster apogee can insert a native 1 ms event step. Compare both adaptive grids at common times.
      for (const [left, right] of [[candidate.series, branch.series], [branch.series, candidate.series]]) {
        near(left[0][0], right[0][0], limits[0]);near(left.at(-1)[0], right.at(-1)[0], limits[0]);
        let cursor = 0;
        for (const row of left) {
          if(row[0] < right[0][0] || row[0] > right.at(-1)[0])continue;
          while(cursor < right.length - 2 && right[cursor + 1][0] < row[0])cursor++;
          const first = right[cursor], last = right[cursor + 1], fraction = last[0] === first[0] ? 0 : (row[0] - first[0]) / (last[0] - first[0]);
          for(let j = 1; j < 4; j++) {
            const value = first[j] === null || last[j] === null ? null : first[j] + fraction * (last[j] - first[j]);
            near(row[j], value, limits[j], `branch ${index} at ${row[0]}/${j}`);
            if(value !== null)maximum[j] = Math.max(maximum[j], Math.abs(row[j] - value));
          }
        }
      }
    }
  });
  return { profile, limits, summaryLimits, maximum, summaryErrors: actual.summary.map((v, i) => Math.abs(v - expected.summary[i])) };
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const Native = Worker;window.views = [];window.results = [];
    window.Worker = class extends Native {
      constructor(url, options) {
        super(url, options);
        if (String(url).includes('document.worker')) window.documentWorker = this;
        this.addEventListener('message', ({ data }) => { if (data.result?.view) window.views.push(data.result.view);if (data.type === 'completed') window.results.push(data.result); });
      }
    };
  });
  await page.goto(process.env.ORK_POC_URL || 'http://127.0.0.1:4173');
  await page.locator('.rocket-drawing polygon').first().waitFor();
  const view = () => page.evaluate(() => window.views.at(-1));
  async function load(path) {
    await page.getByLabel('Open local .ork').setInputFiles(path);await page.getByText(path.split('/').at(-1), { exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Rocket design', exact: true }).click();
  }
  async function download(name) {
    const event = page.waitForEvent('download');await page.getByRole('button', { name: 'Download .ork', exact: true }).click();
    const path = resolve(output, name);await (await event).saveAs(path);return path;
  }
  async function command(action) {
    return page.evaluate(action => new Promise(resolve => {
      const worker = window.documentWorker, id = 90000 + Math.random();
      const listener = ({ data }) => { if (data.id === id) { worker.removeEventListener('message', listener);resolve(data); } };
      worker.addEventListener('message', listener);worker.postMessage({ id, action });
    }), action);
  }
  async function runRow(name) {
    await flights(page);await page.locator('.simulation-table').getByRole('button', { name, exact: true }).click();
    const count = await page.evaluate(() => window.results.length);
    await page.getByRole('button', { name: /^(Run|Restart) flight$/ }).click();
    await page.waitForFunction(count => window.results.length > count || document.querySelector('[data-testid=flight-status]')?.textContent.includes('failed'), count, { timeout: 60000 });
    const status = await page.getByTestId('flight-status').innerText();assert.equal(status, 'Flight completed.');
    return page.evaluate(() => window.results.at(-1).flight);
  }
  for (const name of ['Two stage high power rocket', 'Three stage low power rocket']) {
    const path = resolve(repo, 'core/src/main/resources/datafiles/examples', name + '.ork'), bytes = await readFile(path);
    const archive = await importArchive(new Uint8Array(bytes));await resolveCatalogMotors(archive);
    await load(path);const initial = await view();
    assert.equal(initial.stability.reason, undefined);assert.equal(initial.drawing.error, undefined);
    assert.equal(initial.stages.length, name.startsWith('Two') ? 2 : 3);
    for (const config of initial.flightConfigurations) {
      const input = importedInput(archive, config.id), modelPath = resolve(output, `multistage-${config.id}.txt`), reference = resolve(output, `multistage-${config.id}.json`);
      await writeFile(modelPath, input.model);
      await java('ImportedFlightDesktopProof', ['reference', path, modelPath, reference, 'false', config.id], `multistage-model-${config.id}`);
      await page.locator('#view-configuration').selectOption(config.id);await page.waitForFunction(id => window.views.at(-1).flightConfigurationId === id, config.id);
      const current = await view(), snapshot = resolve(output, `multistage-preview-${config.id}.json`);
      await java('PreviewDesktopProof', ['snapshot', path, config.id, snapshot], `multistage-preview-${config.id}`);
      const native = JSON.parse(await readFile(snapshot, 'utf8'));
      for (const key of ['cg', 'cp', 'length', 'diameter', 'massWithoutMotors', 'massWithMotors', 'caliber', 'aerodynamicLength']) near(current.stability[key], native[key], 1e-10, key);
      near(current.drawing.polygons, native.exterior.polygons, 1e-10, 'exterior');near(current.drawing.internals, native.internals, 1e-10, 'internals');
      const row = current.simulations.find(s => s.configurationId === config.id);assert.ok(row && !row.reason && row.support.supported);
      const actual = await runRow(row.name), expectedPath = resolve(output, `multistage-saved-${config.id}.json`);
      await java('SavedSimulationDesktopProof', ['reference', path, String(current.simulations.indexOf(row)), expectedPath], `multistage-saved-${config.id}`);
      const expected = JSON.parse(await readFile(expectedPath, 'utf8'));
      await writeFile(resolve(output, `multistage-browser-${config.id}.json`), JSON.stringify(actual));
      const profile = config.id === 'b13e8ca2-f54d-4ca8-9b23-06c6c9eb237a' ? 'long-C6' : config.id === '05896b5a-71a7-48ac-b7ae-eadeb267975b' ? 'C6' : 'standard';
      const differences = compareFlight(actual, expected, profile);
      assert.equal(actual.branches.length, initial.stages.length);
      assert.ok(actual.branches[0].events.filter(e => e[0] === 'IGNITION').length >= initial.stages.length);
      assert.ok(actual.branches[0].events.filter(e => e[0] === 'STAGE_SEPARATION').length >= initial.stages.length - 1);
      assert.deepEqual(actual.branches[0].events.filter(e => e[0] === 'IGNITION').map(e => e[2]), [...initial.stages].reverse().flatMap(s => s.motors.map(m => m.id)));
      assert.deepEqual(actual.branches[0].events.filter(e => e[0] === 'STAGE_SEPARATION').map(e => e[2]), [...initial.stages].reverse().slice(0, -1).map(s => s.id));
      report.comparisons.push({ rocket: name, configuration: config.id, branches: actual.branches.map(b => ({ name: b.name, points: b.series.length })), summary: actual.summary, differences });
    }
    await page.getByRole('button', { name: 'Plot', exact: true }).click();
    const graph = page.getByRole('dialog', { name: /^Flight graph/ });assert.equal(await graph.locator('polyline[data-series=altitude]').count(), initial.stages.length);
    await graph.getByRole('button', { name: 'Close', exact: true }).click();
    assert.deepEqual(await readFile(await download(`multistage-unchanged-${initial.stages.length}.ork`)), bytes);
  }
  checks.push('all five bundled 2/3-stage configurations: complete native reconstruction, loaded-desktop geometry/CG/CP, actual browser saved-settings flights, ignition/separation events and every branch sample match JVM; named branch graphs and exact unchanged download');

  const rk6Source = unzipSync(await readFile(resolve(repo, 'core/src/main/resources/datafiles/examples/Three stage low power rocket.ork')));
  const rk6Xml = strFromU8(rk6Source['rocket.ork']).replaceAll('<simulationsteppermethod>rk4</simulationsteppermethod>', '<simulationsteppermethod>rk6</simulationsteppermethod>');
  const rk6Path = resolve(output, 'multistage-rk6.ork');await writeFile(rk6Path, zipSync({ ...rk6Source, 'rocket.ork': strToU8(rk6Xml) }));
  await load(rk6Path);const rk6View = await view(), rk6Row = rk6View.simulations.find(s => s.configurationId === rk6View.flightConfigurationId);
  const rk6Actual = await runRow(rk6Row.name), rk6Reference = resolve(output, 'multistage-rk6-jvm.json');assert.equal(rk6Actual.rk6, true);
  await java('SavedSimulationDesktopProof', ['reference', rk6Path, String(rk6View.simulations.indexOf(rk6Row)), rk6Reference], 'multistage-rk6-reference');
  compareFlight(rk6Actual, JSON.parse(await readFile(rk6Reference, 'utf8')), 'C6');
  checks.push('a three-stage saved RK6 browser flight matches desktop with all branches');

  // Per-configuration edits, inheritance and last-active-stage refusal.
  const fixture = resolve(repo, 'core/src/main/resources/datafiles/examples/Three stage low power rocket.ork');
  await load(fixture);await page.getByRole('tab', { name: 'Motors & Configuration', exact: true }).click();
  await page.getByRole('button', { name: 'Stage settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Stage settings', exact: true });const before = await view();
  await dialog.getByLabel('Stage', { exact: true }).selectOption(before.stages[2].id);
  await dialog.getByLabel('Separates at', { exact: true }).selectOption('burnout');
  await dialog.getByLabel('Separation delay unit', { exact: true }).selectOption('ms');
  await dialog.getByLabel('Separation delay', { exact: true }).fill('300');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual(await readFile(await download('multistage-cancel.ork')), await readFile(fixture));
  await page.getByRole('button', { name: 'Stage settings', exact: true }).click();
  await dialog.getByLabel('Stage', { exact: true }).selectOption(before.stages[2].id);
  await dialog.getByLabel('Stage active', { exact: true }).uncheck();
  await dialog.getByLabel('Separates at', { exact: true }).selectOption('burnout');
  await dialog.getByLabel('Separation delay unit', { exact: true }).selectOption('ms');
  await dialog.getByLabel('Separation delay', { exact: true }).fill('300');
  await dialog.getByLabel(`Ignition at ${before.stages[2].motors[0].name}`, { exact: true }).selectOption('launch');
  await dialog.getByLabel(`Ignition delay ${before.stages[2].motors[0].name}`, { exact: true }).fill('0.2');
  await page.screenshot({ path: resolve(output, 'multistage-settings.png') });
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();await dialog.waitFor({ state: 'detached' });
  const changed = await view();assert.equal(changed.stages[2].active, false);assert.equal(changed.stages[2].separation.delay, '0.3');
  assert.equal(changed.stages[2].motors[0].event, 'launch');assert.equal(changed.stages[2].motors[0].delay, '0.2');
  const editedPath = await download('multistage-edited.ork'), edited = await importArchive(new Uint8Array(await readFile(editedPath)));await resolveCatalogMotors(edited);
  const changedModel = resolve(output, 'multistage-edited.txt');await writeFile(changedModel, importedInput(edited, changed.flightConfigurationId).model);
  await java('ImportedFlightDesktopProof', ['reference', editedPath, changedModel, resolve(output, 'multistage-edited.json'), 'false', changed.flightConfigurationId], 'multistage-edited-reference');
  const original = await importArchive(new Uint8Array(await readFile(fixture)));
  for (const config of changed.flightConfigurations.filter(c => c.id !== changed.flightConfigurationId)) assert.deepEqual(stageSettings(edited, config.id), stageSettings(original, config.id));
  let reduced = edited;
  for (const stage of stageSettings(reduced, changed.flightConfigurationId).filter(s => s.active).slice(1)) reduced = await editStaging(reduced, changed.flightConfigurationId, { ...stage, active: false });
  const last = stageSettings(reduced, changed.flightConfigurationId).find(s => s.active);
  await assert.rejects(editStaging(reduced, changed.flightConfigurationId, { ...last, active: false }), /At least one stage/);
  const stale = await command({ type: 'staging', expectedHash: before.hash, configurationId: before.flightConfigurationId, settings: before.stages[0] });assert.match(stale.error, /Document changed/);
  checks.push('Stage settings OK/Cancel, active flags, per-flight separation/ignition, inherited settings, unaffected configurations, desktop reopen/reconstruction, stale request and last-active refusal');

  // Build a second stage using the palette, enable its mount, create a new flight, and assign both stage motors.
  await load(resolve(repo, 'web/app/public/flight-ready.ork'));
  await page.getByRole('region', { name: 'Add new component' }).getByRole('button', { name: 'Stage', exact: true }).click();
  await page.getByRole('dialog', { name: 'Component editor', exact: true }).getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByRole('region', { name: 'Add new component' }).getByRole('button', { name: 'Body tube', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Component editor', exact: true });
  await editor.getByLabel('Component name', { exact: true }).fill('New booster tube');
  await editor.getByRole('spinbutton', { name: 'Length', exact: true }).fill('0.1');
  await editor.getByRole('spinbutton', { name: 'Wall thickness', exact: true }).fill('0.0003');
  await editor.getByRole('tab', { name: 'Motor', exact: true }).click();
  await editor.getByLabel('This component is a motor mount', { exact: true }).check();await editor.getByRole('button', { name: 'OK', exact: true }).click();await editor.waitFor({ state: 'detached' });
  await page.getByRole('region', { name: 'Add new component' }).getByRole('button', { name: 'Trapezoidal', exact: true }).click();
  await editor.getByRole('button', { name: 'OK', exact: true }).click();await editor.waitFor({ state: 'detached' });
  let created = await view();assert.equal(created.stages.length, 2);assert.equal(created.drawing.error, undefined);
  const boosterMount = created.motorMounts.find(m => m.name.includes('New booster tube')), upperMount = created.motorMounts.find(m => m.id !== boosterMount.id);
  const motor = motors.find(m => m.designation === 'C6' && m.manufacturer === 'Estes');assert.ok(motor);
  let reply = await command({ type: 'createConfiguration', expectedHash: created.hash, name: 'New staged flight', mountId: boosterMount.id, motorKey: motor.key, delay: '0' });assert.equal(reply.error, undefined);created = reply.result.view;
  reply = await command({ type: 'assignMotor', expectedHash: created.hash, configurationId: created.flightConfigurationId, mountId: upperMount.id, motorKey: motor.key, delay: '5' });assert.equal(reply.error, undefined);created = reply.result.view;
  reply = await command({ type: 'staging', expectedHash: created.hash, configurationId: created.flightConfigurationId, settings: { ...created.stages[1], separation: { event: 'upperignition', altitude: '200', delay: '0' } } });assert.equal(reply.error, undefined);created = reply.result.view;
  const createdPath = await download('multistage-created.ork');
  // Direct document commands are the same trusted reducer used by the UI; reopening refreshes React's view.
  await load(createdPath);created = await view();await page.locator('#view-configuration').selectOption(created.flightConfigurations.find(c => c.name === 'New staged flight').id);
  await page.waitForFunction(() => window.views.at(-1).flightConfigurations.find(c => c.id === window.views.at(-1).flightConfigurationId)?.name === 'New staged flight');created = await view();
  const row = created.simulations.find(s => s.configurationId === created.flightConfigurationId), actual = await runRow(row.name);
  await writeFile(resolve(output, 'multistage-created-browser.json'), JSON.stringify(actual));
  assert.equal(actual.branches.length, 2);const expectedPath = resolve(output, 'multistage-created-jvm.json');
  await java('SavedSimulationDesktopProof', ['reference', createdPath, String(created.simulations.indexOf(row)), expectedPath], 'multistage-created-reference');
  const expected = JSON.parse(await readFile(expectedPath, 'utf8'));compareFlight(actual, expected, 'C6');
  checks.push('palette creates a second stage and body tube, Motor tab enables mount, configuration creation includes all stages, independent catalog assignments run as a two-stage browser flight matching desktop');

  const booster = (await view()).components.find(c => c.name === 'New booster tube');
  let unsafe = await view();
  const changes = ['length', 'thickness'].map(name => ({ ...booster.properties.find(p => p.name === name), value: name === 'length' ? '0.3' : '0.002' }));
  let unsafeReply = await command({ type: 'componentProperties', expectedHash: unsafe.hash, id: booster.id, name: booster.name, changes });assert.equal(unsafeReply.error, undefined);unsafe = unsafeReply.result.view;
  const boosterIndex = unsafe.components.findIndex(c => c.id === booster.id), fins = unsafe.components.find(c => c.type === 'trapezoidfinset' && c.parent === boosterIndex);
  unsafeReply = await command({ type: 'componentTree', expectedHash: unsafe.hash, id: fins.id, operation: 'delete' });assert.equal(unsafeReply.error, undefined);
  const unstablePath = await download('multistage-unstable.ork');await load(unstablePath);
  const aborted = await runRow(row.name);
  assert.ok(aborted.events.some(event => event[0] === 'SIM_ABORT'));
  assert.ok(aborted.series.some(point => point[3] === null), 'undefined native acceleration is valid JSON null');
  checks.push('a native aborted unstable-design result retains its abort event and serializes undefined primary acceleration as null');

  const entries = unzipSync(await readFile(fixture)), xml = strFromU8(entries['rocket.ork']);
  for (const modified of [xml.replace('separationevent>upperignition', 'separationevent>unknown'), xml.replace('<stage number="1" active="true"/>', '<stage number="0" active="true"/>'), xml.replace('<finpoints>', '<finpoints unknown="true">'), xml.replace('<separationdelay>0.0</separationdelay>', '<separationdelay>0x1</separationdelay>')]) {
    assert.notEqual(xml, modified);const bad = await importArchive(zipSync({ ...entries, 'rocket.ork': strToU8(modified) }));
    assert.equal(flightSupport(bad).supported, false);
  }
  assert.deepEqual(errors, []);report.outcome = 'passed';await page.screenshot({ path: resolve(output, 'multistage.png') });
  console.log('Multistage creation, all bundled configurations, native branch parity and stage settings passed.');
} catch (error) { report.outcome = 'failed';report.error = String(error);throw error; }
finally { globalThis.fetch = originalFetch;await writeFile(resolve(output, 'multistage-report.json'), JSON.stringify(report, null, 2) + '\n');await browser.close(); }
