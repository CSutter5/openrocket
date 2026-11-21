import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { prepare, java, output, repo } from './fixtures.mjs';
import { flights, openProperties } from './workspace.mjs';

await prepare();
const fixture = resolve(output, 'preview-internals.ork'), saved = resolve(output, 'preview-saved.ork');
await java('PreviewDesktopProof', ['generate', resolve(repo, 'web/app/public/flight-ready.ork'), fixture], 'preview-generate');
await java('ImportedFlightDesktopProof', ['generate', resolve(repo, 'web/app/public/flight-ready.ork'), resolve(output, 'preview-base.ork')], 'preview-base');
await java('SavedSimulationDesktopProof', ['generate', resolve(output, 'preview-base.ork'), saved], 'preview-saved');
const browser = await chromium.launch({ headless: true }), checks = [], errors = [];
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const Native = Worker; window.views = []; window.flights = [];
    window.Worker = class extends Native {
      constructor(url, options) { super(url, options); this.addEventListener('message', event => {
        if (event.data.result?.view) window.views.push(event.data.result.view);
        if (event.data.type === 'completed') window.flights.push(event.data.result);
      }); }
    };
  });
  await page.goto(process.env.ORK_POC_URL || 'http://127.0.0.1:4173');
  await page.locator('.rocket-drawing polygon').first().waitFor();
  const drawing = page.getByRole('region', { name: 'Rocket drawing', exact: true });
  await page.getByLabel('Open local .ork').setInputFiles(fixture);
  await page.getByRole('status').filter({ hasText: 'Archive opened.' }).waitFor();
  const view = await page.evaluate(() => window.views.at(-1));
  assert.equal(view.stability.reason, undefined);
  const expectedPath = resolve(output, 'preview-desktop.json');
  await java('PreviewDesktopProof', ['snapshot', fixture, 'default', expectedPath], 'preview-desktop');
  const expected = JSON.parse(await readFile(expectedPath, 'utf8'));
  for (const key of ['cg', 'cp', 'length', 'diameter', 'massWithoutMotors', 'massWithMotors', 'caliber', 'aerodynamicLength'])
    assert.ok(Math.abs(expected[key] - view.stability[key]) < 1e-10, `loaded desktop ${key}`);
  const margin = expected.cp - expected.cg;
  const [calibers, percent] = (await page.getByTestId('preview-stability').innerText()).split(' / ').map(text => Number(text.split(' ')[0].replaceAll(',', '')));
  assert.equal(calibers, Number((margin / expected.caliber).toPrecision(4)));
  assert.equal(percent, Number((margin / expected.aerodynamicLength * 100).toPrecision(4)));
  const shapes = await drawing.locator('.internal-component').evaluateAll(nodes => nodes.map(node => JSON.parse(node.dataset.geometry)));
  assert.equal(shapes.length, expected.internals.length);
  shapes.forEach((shape, i) => {
    assert.equal(shape.id, expected.internals[i].id); assert.equal(shape.kind, expected.internals[i].kind);
    for (const key of ['x', 'y', 'length', 'radius', 'innerRadius']) assert.ok(Math.abs(shape[key] - expected.internals[i][key]) < 1e-10, `desktop internal ${i}/${key}`);
  });
  for (const kind of ['tube', 'motor', 'mass', 'parachute', 'streamer', 'shoulder']) assert.ok(shapes.some(shape => shape.kind === kind), kind);
  const ballast = view.components.find(component => component.name === 'Offset ballast');
  const pack = shapes.find(shape => shape.id === ballast.id);
  assert.equal(pack.y, .006); assert.equal(pack.length, .023); assert.equal(pack.radius, .004);
  const inner = view.components.find(component => component.type === 'innertube');
  assert.equal(shapes.find(shape => shape.id === inner.id).y, .003, 'inner-tube offset applied exactly once');
  const selectable = drawing.getByTestId(`rocket-internal-${ballast.id}`);
  await selectable.focus(); await page.keyboard.press('Enter');
  assert.equal(await page.getByRole('button', { name: 'Offset ballast masscomponent', exact: true }).getAttribute('aria-pressed'), 'true');
  const bounds = await selectable.boundingBox();
  await page.mouse.dblclick(bounds.x, bounds.y + bounds.height / 2);
  await page.getByRole('dialog', { name: 'Component editor', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Component name', { exact: true }).inputValue(), 'Offset ballast');
  await page.getByRole('button', { name: 'Close Component editor', exact: true }).click();
  await page.screenshot({ path: resolve(output, 'preview-internals.png') });
  const entries = unzipSync(await readFile(fixture));
  entries['rocket.ork'] = strToU8(strFromU8(entries['rocket.ork']).replace(/<id>([a-f0-9-]+)<\/id>/g, (_, id) => `<id>${id.toUpperCase()}</id>`));
  await page.getByLabel('Open local .ork').setInputFiles({ name: 'uppercase-preview.ork', mimeType: 'application/octet-stream', buffer: Buffer.from(zipSync(entries)) });
  await page.getByText('uppercase-preview.ork', { exact: true }).waitFor();
  assert.equal(await drawing.locator('.internal-component').count(), shapes.length, 'uppercase archive IDs still map to native internal shapes');
  assert.equal(await drawing.getByTestId(`rocket-internal-${ballast.id.toUpperCase()}`).count(), 1);
  checks.push('all eight physical/stability values and every internal descriptor match a desktop-loaded archive; independent off-axis pack/tube dimensions; keyboard selection and mouse double-click open its editor');

  await page.getByLabel('Open local .ork').setInputFiles(saved); await page.getByText('preview-saved.ork', { exact: true }).waitFor();
  const initial = await page.evaluate(() => window.views.at(-1));
  const first = initial.simulations.find(row => row.configurationId === initial.flightConfigurationId);
  assert.ok(first.maxAcceleration > 0); assert.match(await page.getByTestId('preview-flight-status').innerText(), /Stored result/);
  const launch = await page.getByTestId('preview-launch-mass').innerText();
  const apogee = await page.getByTestId('preview-apogee').innerText();
  await page.locator('#view-configuration').selectOption(initial.flightConfigurations[1].id);
  await page.waitForFunction(id => window.views.at(-1)?.flightConfigurationId === id, initial.flightConfigurations[1].id);
  assert.notEqual(await page.getByTestId('preview-apogee').innerText(), apogee);
  assert.notEqual(await page.getByTestId('preview-launch-mass').innerText(), launch);
  await page.locator('#view-configuration').selectOption(initial.flightConfigurations[4].id);
  await page.waitForFunction(id => window.views.at(-1)?.flightConfigurationId === id, initial.flightConfigurations[4].id);
  assert.equal(await page.getByTestId('preview-apogee').innerText(), 'Unavailable');
  assert.match(await page.getByTestId('preview-flight-status').innerText(), /Not run/);
  assert.equal(await drawing.locator('.internal-motor').count(), 0);
  assert.equal(await page.getByTestId('preview-dry-mass').innerText(), await page.getByTestId('preview-launch-mass').innerText());
  await page.locator('#view-configuration').selectOption(initial.flightConfigurationId);
  await flights(page); await page.locator('.simulation-table').getByRole('button', { name: first.name, exact: true }).click();
  await page.getByRole('button', { name: 'Run flight', exact: true }).click();
  await page.getByTestId('flight-status').filter({ hasText: 'Flight completed.' }).waitFor({ timeout: 60000 });
  assert.match(await page.getByTestId('preview-flight-status').innerText(), /Completed/);
  const result = await page.evaluate(() => window.flights.at(-1));
  const flightPath = resolve(output, 'preview-flight-jvm.json');
  await java('SavedSimulationDesktopProof', ['reference', saved, '0', flightPath], 'preview-flight-reference');
  const nativeFlight = JSON.parse(await readFile(flightPath, 'utf8'));
  assert.ok(Math.abs(result.flight.maxAcceleration - nativeFlight.maxAcceleration) < 1e-6, 'native maximum acceleration semantics');
  assert.match(await page.getByTestId('preview-acceleration').innerText(), /m\/s²/);
  await page.getByRole('tab', { name: 'Rocket design', exact: true }).click();
  const body = initial.components.find(component => component.type === 'bodytube');
  await page.getByRole('button', { name: `${body.name} bodytube`, exact: true }).click(); await openProperties(page, { advanced: false });
  await page.getByLabel('Component name', { exact: true }).fill('Preview stale result');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByRole('dialog', { name: 'Component editor', exact: true }).waitFor({ state: 'detached' });
  assert.notEqual((await page.evaluate(() => window.views.at(-1))).hash, initial.hash, 'dialog rename refreshes the accepted archive hash');
  await page.getByTestId('preview-flight-status').filter({ hasText: 'Outdated result' }).waitFor();
  checks.push('configuration switches update stored results, mass and motor geometry; no-motor config has no inherited flight stats; completed browser results reach preview; max acceleration matches JVM; edits mark results outdated');
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'preview-report.json'), JSON.stringify({ outcome: 'passed', checks, browser: browser.version() }, null, 2) + '\n');
  console.log('Rocket preview passed: ' + checks.join('; '));
} catch (error) {
  await page?.screenshot({ path: resolve(output, 'preview-failure.png') });
  await writeFile(resolve(output, 'preview-failure.txt'), await page?.locator('body').innerText() ?? 'No page');
  throw error;
} finally { await browser.close(); }
