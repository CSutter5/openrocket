import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { importArchive } from '../../packages/ork-format/src/index.js';
import { flightSupport, flightConfigurations, flightInput } from '../src/simulation/input.ts';
import { java, repo, output } from './fixtures.mjs';
import { flights } from './workspace.mjs';
// saved-flights.mjs supplies two native simulations with full settings and independent JVM comparisons.
const fixture = resolve(output, 'saved-conditions.ork'), bytes = await readFile(fixture), archive = await importArchive(new Uint8Array(bytes));
const generatedCatalog = resolve(output, 'flight-motors.json');
await java('FlightCatalogExporter', [resolve(repo, 'core/src/main/resources/datafiles/thrustcurves/initial_motors.db'), generatedCatalog], 'imported-catalog');
assert.deepEqual(JSON.parse(await readFile(generatedCatalog, 'utf8')), JSON.parse(await readFile(resolve(repo, 'web/app/src/simulation/motors.json'), 'utf8')));
const choices = flightConfigurations(archive);assert.equal(choices.length, 5);
assert.ok(choices.find(c => c.label.includes('Fast flight')).label.includes('J800T'));
assert.equal(flightSupport(archive, choices.at(-1).id).supported, false);
await assert.rejects(flightInput(archive, 'unknown-configuration'), /Unknown selected/);
const bundled = unzipSync(bytes), xml = strFromU8(bundled['rocket.ork']);
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const checks = [];
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));await page.goto(process.env.ORK_POC_URL || 'http://127.0.0.1:4174');await flights(page);
  async function open(bytes, name) { await page.getByLabel('Open local .ork').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });await page.getByText(name, { exact: true }).waitFor(); }
  async function download() { const event = page.waitForEvent('download');await page.getByRole('button', { name: 'Download .ork', exact: true }).click();return readFile(await (await event).path()); }
  const cases = [
    ['document-settings', xml.replace('<docprefs>', '<docprefs unknown="refuse">')],
    ['numeric-lexeme', xml.replace(/<length>[^<]+<\/length>/, '<length>0x1</length>')],
    ['extension', xml.replace('<simulations>', '<simulations><simulation status="not_simulated"><name>Untrusted</name><extension extensionid="ScriptingExtension"><script>throw new Error("must not run")</script></extension></simulation>')],
    ['unknown-component-field', xml.replace('<finish>normal</finish>', '<future:physics xmlns:future="urn:test"/><finish>normal</finish>')],
  ];
  for (const [name, modified] of cases) {
    assert.notEqual(modified, xml, `fixture mutation ${name}`);
    const rejected = zipSync({ ...bundled, 'rocket.ork': strToU8(modified) });
    assert.equal(flightSupport(await importArchive(rejected)).supported, false, name);
    await open(rejected, name + '.ork');
    await page.locator('.simulation-table').getByRole('button', { name: 'Saved low wind', exact: true }).click();
    await page.getByRole('region', { name: 'Flight simulations', exact: true }).getByRole('alert').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Run flight', exact: true }).isDisabled(), true, name);
    assert.deepEqual(await download(), Buffer.from(rejected));
  }
  checks.push('unknown settings, malformed numbers, scripting extensions and unsupported component fields refuse visibly and retain exact archive');
  // The original synthetic fixture still refuses missing or changed embedded motor data.
  const simple = unzipSync(await readFile(resolve(repo, 'web/app/public/flight-ready.ork')));
  for (const mode of ['missing', 'changed']) {
    const entries = { ...simple }, path = Object.keys(entries).find(n => n.endsWith('.rse'));
    if (mode === 'missing') delete entries[path];else entries[path] = strToU8(strFromU8(entries[path]).replace('f="12.0"', 'f="12.1"'));
    assert.equal(flightSupport(await importArchive(zipSync(entries))).supported, false);
  }
  const opaque = zipSync({ ...bundled, 'rocket.ork': strToU8(xml.replace('<simulations>', '<datatypes><type source="customexpression"><name>Energy</name><symbol>Ek</symbol><unit unittype="auto">J</unit><expression>0.5*m*Vt^2</expression></type></datatypes><simulations>').replace('</openrocket>', '<!-- Opaque preservation marker -->\n</openrocket>')), 'opaque/flight.bin': new Uint8Array([0, 255, 9, 37]) });
  await open(opaque, 'opaque-flight.ork');
  await page.getByRole('button', { name: 'Run flight', exact: true }).click();await page.getByTestId('flight-status').filter({ hasText: 'Flight completed.' }).waitFor({ timeout: 60000 });
  assert.deepEqual(await download(), Buffer.from(opaque));
  await page.getByRole('button', { name: 'Run flight', exact: true }).click();await page.getByTestId('flight-status').filter({ hasText: 'Running flight' }).waitFor();
  await page.getByRole('button', { name: 'Cancel flight', exact: true }).click();await page.getByTestId('flight-status').filter({ hasText: 'Flight cancelled' }).waitFor();assert.deepEqual(await download(), Buffer.from(opaque));
  checks.push('all five archived configurations inspectable; unresolved motor data refused; custom expressions, opaque XML and binary assets remain exact after real run and cancel');
  assert.deepEqual(errors, []);await writeFile(resolve(output, 'imported-flight-report.json'), JSON.stringify({ outcome: 'passed', checks }, null, 2) + '\n');
  console.log('Imported configuration inspection, saved-row refusals and opaque archive preservation passed.');
} finally { await browser.close(); }
