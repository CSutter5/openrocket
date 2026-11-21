import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { unzipSync } from 'fflate';
import { prepare, java, output, repo } from './fixtures.mjs';
import { flights, openProperties, closeProperties } from './workspace.mjs';
await import('./simulation-jobs.mjs');
await prepare();
await java('SimulationDesktopProof', ['generate', resolve(output, 'flight-regenerated.ork')], 'flight-generate');
const generated = unzipSync(await readFile(resolve(output, 'flight-regenerated.ork'))), bundled = unzipSync(await readFile(resolve(repo, 'web/app/public/flight-ready.ork')));
assert.deepEqual(generated, bundled, 'Desktop-generated base fixture remains unchanged');
const fixture = resolve(output, 'simple-saved-flights.ork');
await java('SavedSimulationDesktopProof', ['generate-simple', resolve(repo, 'web/app/public/flight-ready.ork'), fixture], 'simple-saved-generate');
const original = await readFile(fixture), checks = [], comparisons = [], errors = [];
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const Native = Worker;window.messages = [];window.flightWorkers = [];window.held = [];window.hold = false;window.ticks = 0;
    setInterval(() => window.ticks++, 10);
    window.Worker = class extends Native {
      constructor(url, options) { super(url, options);if (String(url).includes('simulation.worker')) {
        window.flightWorkers.push(this);this.addEventListener('message', e => {
          window.messages.push({ ...e.data, ticks: window.ticks });
          if (e.data.type === 'completed' && window.hold) { window.held.push({ worker: this, data: e.data });e.stopImmediatePropagation(); }
        });
      } }
      postMessage(data, ...rest) { this.sent = data;return super.postMessage(data, ...rest); }
    };
  });
  await page.goto(process.env.ORK_POC_URL || 'http://127.0.0.1:4174');await flights(page);
  const panel = page.getByRole('region', { name: 'Flight simulations', exact: true }), status = page.getByTestId('flight-status'), table = page.locator('.simulation-table');
  const select = name => table.getByRole('button', { name, exact: true }).click();
  const run = () => panel.getByRole('button', { name: /^(Run|Restart) flight$/, exact: true }).click();
  const complete = () => status.filter({ hasText: 'Flight completed.' }).waitFor({ timeout: 60000 });
  const latest = () => page.evaluate(() => window.messages.filter(m => m.type === 'completed').at(-1).result);
  async function open(path = fixture) { await page.getByLabel('Open local .ork').setInputFiles(path);await page.getByText(path.split('/').at(-1), { exact: true }).waitFor(); }
  async function download() { const event = page.waitForEvent('download');await page.getByRole('button', { name: 'Download .ork', exact: true }).click();return readFile(await (await event).path()); }
  async function reference(path, index, actual, name) {
    const file = resolve(output, name + '-jvm.json');await java('SavedSimulationDesktopProof', ['reference', path, String(index), file], name + '-reference');
    const expected = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(actual.rk6, expected.rk6);assert.equal(actual.series.length, expected.series.length);assert.deepEqual(actual.inputs, expected.inputs);
    for (const key of ['mass', 'cg', 'cp']) assert.ok(Math.abs(expected[key] - actual[key]) <= 1e-10);
    const limits = [.001, .12, .25, 3], maxErrors = [0, 0, 0, 0];
    expected.series.forEach((row, i) => row.forEach((value, j) => { const error = Math.abs(actual.series[i][j] - value);assert.ok(error <= limits[j], `${name} ${i}/${j}: ${error}`);maxErrors[j] = Math.max(maxErrors[j], error); }));
    expected.summary.forEach((value, i) => assert.ok(Math.abs(actual.summary[i] - value) <= [.001, .000001, .001, .001][i]));
    assert.deepEqual(actual.events.map(r => r[0]), expected.events.map(r => r[0]));expected.events.forEach((r, i) => assert.ok(Math.abs(r[1] - actual.events[i][1]) <= .001));
    assert.ok(Math.abs(actual.motorImpulse - 10.4) < 1e-12);assert.deepEqual(actual.motorThrustSamples, [6, 9]);
    const tube = actual.inputs.components.find(c => c.type === 'BodyTube');assert.ok(Math.abs(tube.mass - 950 * Math.PI * (tube.radius ** 2 - (tube.radius - tube.thickness) ** 2) * tube.length) < 1e-12);
    comparisons.push({ name, rows: actual.series.length, maxErrors, limits });
  }
  await open();
  for (const [index, name] of ['Simple RK4', 'Simple RK6'].entries()) { await select(name);await run();await complete();await reference(fixture, index, (await latest()).flight, 'simple-' + index); }
  const baseline = await latest();
  assert.deepEqual(await download(), original);
  assert.ok(await page.evaluate(() => window.messages.filter(r => r.type === 'completed').every(r => r.ticks > window.messages.find(s => s.jobId === r.jobId && s.type === 'running').ticks)));
  await page.getByLabel('Length units', { exact: true }).selectOption('in');
  assert.ok((await table.getByRole('row').filter({ hasText: 'Simple RK6' }).innerText()).includes((baseline.flight.summary[0] / .0254).toFixed(2)));
  await page.getByLabel('Length units', { exact: true }).selectOption('m');assert.deepEqual(await download(), original);
  checks.push('both native saved steppers match JVM including independent motor/tube checks; units, page responsiveness and byte preservation');
  await run();await status.filter({ hasText: 'Running flight' }).waitFor();
  await panel.getByRole('button', { name: 'Cancel flight', exact: true }).click();await status.filter({ hasText: 'Flight cancelled' }).waitFor();
  await page.evaluate(baseline => { const w = window.flightWorkers.at(-1);w.dispatchEvent(new MessageEvent('message', { data: { ...w.sent, type: 'completed', result: baseline } })); }, baseline);
  await status.filter({ hasText: 'Flight cancelled' }).waitFor();assert.deepEqual(await download(), original);
  await page.route('**/simulation.worker-*.js', route => route.abort('failed'));await run();await status.filter({ hasText: 'Flight failed' }).waitFor();
  await page.unroute('**/simulation.worker-*.js');await run();await complete();
  checks.push('computing worker cancellation, injected late message rejection, startup failure and recovery');
  // Hold real completions to test changing rows and restarting across configurations deterministically.
  await page.evaluate(() => window.hold = true);await run();await page.waitForFunction(() => window.held.length === 1);
  await select('Simple RK4');await page.evaluate(() => { window.hold = false;const h = window.held.shift();h.worker.dispatchEvent(new MessageEvent('message', { data: h.data })); });await complete();
  assert.equal(await table.getByRole('button', { name: 'Simple RK4', exact: true }).getAttribute('aria-pressed'), 'true');
  await select('Simple RK6');await page.evaluate(() => window.hold = true);await run();await page.waitForFunction(() => window.held.length === 1);
  await select('Simple RK4');await page.evaluate(() => window.hold = false);await run();await complete();const newer = await latest();
  await page.evaluate(() => { const h = window.held.shift();h.worker.dispatchEvent(new MessageEvent('message', { data: h.data })); });
  await table.getByRole('button', { name: 'Simple RK4', exact: true }).dblclick();
  const graph = page.getByRole('dialog', { name: 'Flight graph · Simple RK4', exact: true });assert.equal((await graph.locator('polyline[data-series=altitude]').getAttribute('points')).split(' ').length, newer.flight.series.length);await graph.press('Escape');
  checks.push('captured results stay with their own rows; restarting another row rejects superseded completion');
  await openProperties(page);await page.getByLabel('BodyTube length (m)', { exact: true }).fill('0.35');await page.getByRole('button', { name: 'Apply length', exact: true }).click();await page.getByTestId('length').filter({ hasText: '0.35' }).waitFor();await closeProperties(page);
  await table.getByRole('row').filter({ hasText: 'Simple RK4' }).getByText('Outdated', { exact: true }).waitFor();
  const edited = await download(), editedPath = resolve(output, 'simple-saved-edited.ork');await writeFile(editedPath, edited);
  await run();await complete();await reference(editedPath, 0, (await latest()).flight, 'simple-edited');assert.deepEqual(await download(), edited);
  const oldIdentity = (await latest()).provenance.identitySidecarHash;
  await open(editedPath);await run();await complete();assert.notEqual((await latest()).provenance.identitySidecarHash, oldIdentity);assert.deepEqual(await download(), edited);
  checks.push('physical edit marks completed row outdated; edited rerun matches JVM; replacement import binds fresh sidecar identities');
  // A completion from a replaced document must not populate the replacement rows.
  await page.evaluate(() => window.hold = true);await run();await page.waitForFunction(() => window.held.length === 1);await open();
  await page.evaluate(() => { window.hold = false;const h = window.held.shift();h.worker.dispatchEvent(new MessageEvent('message', { data: h.data })); });await complete();
  assert.equal(await table.getByText('Completed', { exact: true }).count(), 0);assert.deepEqual(await download(), original);
  assert.deepEqual(errors, []);await writeFile(resolve(output, 'simulation-report.json'), JSON.stringify({ outcome: 'passed', checks, comparisons }, null, 2) + '\n');
  console.log('Saved-row simulation regression passed: both steppers/JVM, edit/rerun, responsive cancellation, failure recovery, row switching, restart and replacement races.');
} finally { await browser.close(); }
