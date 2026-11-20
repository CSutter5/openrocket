import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, delimiter } from 'node:path';
import { chromium } from 'playwright';
import { zipSync } from 'fflate';
import { importArchive } from '../../packages/ork-format/src/index.js';
import { java, run, output, repo } from './fixtures.mjs';
import { openProperties } from './workspace.mjs';
await run('javac', ['-cp', resolve(output, 'classes') + delimiter + process.env.ORK_PROOF_CLASSPATH, '-d', resolve(output, 'classes'), resolve(repo, 'web/app/test/ComponentDesktopProof.java')], 'motor-mount-javac');
const browser = await chromium.launch({ headless: true }), errors = [], checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { const Native = Worker;window.Worker = class extends Native { constructor(url, options) { super(url, options);if (String(url).includes('document.worker')) { window.documentWorker = this;this.addEventListener('message', ({ data }) => { if (data.result?.view) { window.view = data.result.view;window.version = (window.version ?? 0) + 1; } }); } } }; });
  await page.goto(process.env.ORK_POC_URL || 'http://127.0.0.1:4177');await page.locator('.component-tree button').first().waitFor();
  const editor = page.getByRole('dialog', { name: 'Component editor', exact: true }), sample = resolve(repo, 'web/app/public/rocket-sample.ork');
  const rich = resolve(output, 'explicit/G1-A.ork');
  const view = () => page.evaluate(() => window.view);
  async function load(path) { const before = await page.evaluate(() => window.version);await page.getByLabel('Open local .ork').setInputFiles(path);await page.waitForFunction(v => window.version > v, before); }
  async function open(type) { await page.getByRole('tab', { name: 'Rocket design', exact: true }).click();const component = (await view()).components.find(c => c.type === type);await page.locator(`.component-tree [data-component-id="${component.id}"]`).click();await openProperties(page, { advanced: false });await editor.getByRole('tab', { name: 'Motor', exact: true }).click();return component.id; }
  async function save() { await editor.getByRole('button', { name: 'OK', exact: true }).click();await editor.waitFor({ state: 'detached' }); }
  async function quantity(label, value, unit) { await editor.getByLabel(`${label} unit`, { exact: true }).selectOption(unit);await editor.getByRole('spinbutton', { name: label, exact: true }).fill(String(value)); }
  async function download(name) { const event = page.waitForEvent('download');await page.getByRole('button', { name: 'Download .ork', exact: true }).click();const path = resolve(output, `mount-${name}.ork`);await (await event).saveAs(path);return path; }
  async function native(source, path, id, settings, name) { const json = resolve(output, `mount-${name}.json`);await writeFile(json, JSON.stringify(settings));await java('ComponentDesktopProof', ['motor-mount', source, path, id, json, resolve(output, `native-mount-${name}`)], `native-mount-${name}`); }
  async function raw(action) { return page.evaluate(action => new Promise(resolve => { const id = 900000 + Math.random();const receive = ({ data }) => { if (data.id === id) { window.documentWorker.removeEventListener('message', receive);resolve(data); } };window.documentWorker.addEventListener('message', receive);window.documentWorker.postMessage({ id, action }); }), action); }
  await load(sample);const source = await readFile(sample), bodyId = await open('bodytube');
  assert.equal(await editor.getByLabel('This component is a motor mount', { exact: true }).isChecked(), false);
  assert.equal(await editor.getByRole('spinbutton', { name: 'Motor overhang', exact: true }).isDisabled(), true);
  await editor.getByLabel('This component is a motor mount', { exact: true }).check();await quantity('Motor overhang', .375, 'in');
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();assert.deepEqual(await readFile(await download('cancel')), source);
  await open('bodytube');await editor.getByLabel('This component is a motor mount', { exact: true }).check();
  await quantity('Motor overhang', .375, 'in');await editor.getByLabel('Ignition at', { exact: true }).selectOption('launch');await quantity('Ignition delay', 250, 'ms');
  await page.screenshot({ path: resolve(output, 'motor-mount-tab.png') });await save();
  const enabled = await download('body-enabled'), settings = { enabled: true, overhang: .375 * .0254, ignitionEvent: 'launch', ignitionDelay: .25 };
  await native(sample, enabled, bodyId, settings, 'body-enabled');
  assert.ok((await view()).motorMounts.some(m => m.id === bodyId));
  await load(enabled);await open('bodytube');assert.equal(await editor.getByLabel('This component is a motor mount', { exact: true }).isChecked(), true);
  await editor.getByLabel('Motor overhang unit', { exact: true }).selectOption('mm');await editor.getByLabel('Motor overhang unit', { exact: true }).selectOption('in');await save();
  assert.deepEqual(await readFile(await download('units-noop')), await readFile(enabled));
  await open('bodytube');await editor.getByLabel('This component is a motor mount', { exact: true }).uncheck();await editor.getByLabel('This component is a motor mount', { exact: true }).check();await save();
  assert.deepEqual(await readFile(await download('toggle-noop')), await readFile(enabled));
  checks.push('body mount checkbox, Cancel, native overhang/ignition defaults, independent in/ms units, reopen and exact no-op bytes');

  // A tube enabled here becomes selectable by the existing catalog workflow.
  await load(resolve(repo, 'web/app/public/explicit-tube.ork'));const newId = await open('bodytube');await editor.getByLabel('This component is a motor mount', { exact: true }).check();
  await editor.getByRole('button', { name: 'Apply and open Motors & Configuration', exact: true }).click();await editor.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'New configuration', exact: true }).click();const picker = page.getByRole('dialog', { name: 'New configuration', exact: true });
  await picker.getByLabel('Configuration name', { exact: true }).fill('New tube flight');assert.equal(await picker.getByLabel('Motor mount', { exact: true }).inputValue(), newId);
  await picker.locator('input[name="catalog-motor"]').first().check();await picker.getByRole('button', { name: 'Create configuration', exact: true }).click();await picker.waitFor({ state: 'detached' });
  assert.equal((await view()).motorMounts.find(m => m.id === newId).assignments.length, 1);
  await open('bodytube');await editor.getByLabel('This component is a motor mount', { exact: true }).uncheck();await save();assert.equal((await view()).motorMounts.length, 0);
  checks.push('enable a previously unconfigured tube, apply/navigate, assign a catalog motor in a new configuration, and disable it');

  await load(rich);const innerId = await open('innertube'), before = (await view()).components.find(c => c.id === innerId).motorMount;
  const changed = { enabled: true, overhang: Number(before.overhang), ignitionEvent: 'burnout', ignitionDelay: .75 };
  await editor.getByLabel('Ignition at', { exact: true }).selectOption('burnout');await quantity('Ignition delay', .75, 's');await save();
  const defaults = await download('inner-defaults');await native(rich, defaults, innerId, changed, 'inner-defaults');
  const original = await importArchive(new Uint8Array(await readFile(rich))), after = await importArchive(new Uint8Array(await readFile(defaults)));
  const originalMount = original.parsed.components.find(c => c.id === innerId).children.find(n => n.name === 'motormount');
  const afterMount = after.parsed.components.find(c => c.id === innerId).children.find(n => n.name === 'motormount');
  const assignments = (archive, mount) => mount.children.filter(n => ['motor', 'ignitionconfiguration'].includes(n.name)).map(n => archive.xml.slice(n.start, n.end));
  assert.deepEqual(assignments(after, afterMount), assignments(original, originalMount));
  for (const entry of original.entries.filter(e => e.path !== 'rocket.ork')) assert.equal(after.entries.find(e => e.path === entry.path).sha256, entry.sha256);
  await open('innertube');await quantity('Motor overhang', -2, 'mm');await save();const overhang = await download('inner-overhang');
  await native(defaults, overhang, innerId, { ...changed, overhang: -.002 }, 'inner-overhang');
  await open('innertube');await editor.getByLabel('This component is a motor mount', { exact: true }).uncheck();await save();const disabled = await download('inner-disabled');
  await native(overhang, disabled, innerId, { enabled: false }, 'inner-disabled');
  checks.push('native inner-tube default ignition, signed overhang and disabling match full desktop serialization/save/reload; existing per-flight motors/ignition and opaque assets retained');

  // Older files may omit explicit per-flight ignition; native instances retain their old defaults.
  const noOverrides = resolve(output, 'mount-no-overrides.ork');
  const noOverrideXml = original.xml.replace(/<ignitionconfiguration\b[^>]*>[\s\S]*?<\/ignitionconfiguration>/g, '');
  await writeFile(noOverrides, zipSync(Object.fromEntries(original.entries.map(entry => [entry.path, entry.path === 'rocket.ork' ? new TextEncoder().encode(noOverrideXml) : entry.bytes]))));
  await load(noOverrides);await open('innertube');await editor.getByLabel('Ignition at', { exact: true }).selectOption('never');await save();
  const legacy = await download('legacy-defaults');await native(noOverrides, legacy, innerId, { ...before, ignitionEvent: 'never' }, 'legacy-defaults');
  checks.push('legacy assignments without explicit ignition preserve their native loaded values when defaults change');

  await load(enabled);const accepted = await view();
  for (const motorMount of [{ ...settings, overhang: 'NaN', ignitionDelay: '0' }, { ...settings, overhang: '0', ignitionDelay: '-1' }, { ...settings, overhang: '0', ignitionDelay: '0', ignitionEvent: '<bad>' }]) {
    const reply = await raw({ type: 'componentProperties', expectedHash: accepted.hash, id: bodyId, name: 'Must not publish', changes: [], motorMount });assert.ok(reply.error);
  }
  assert.deepEqual(await readFile(await download('rejected')), await readFile(enabled));
  await open('bodytube');await page.setViewportSize({ width: 390, height: 844 });await page.screenshot({ path: resolve(output, 'motor-mount-phone.png') });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const footer = await editor.getByRole('button', { name: 'OK', exact: true }).boundingBox();assert.ok(footer.y + footer.height <= 844);await editor.press('Escape');
  assert.deepEqual(errors, []);checks.push('invalid motor settings fail atomically and phone controls/footer remain usable');
  await writeFile(resolve(output, 'motor-mount-report.json'), JSON.stringify({ outcome: 'passed', browser: browser.version(), checks }, null, 2));
  console.log(`Motor mount passed in Chromium ${browser.version()}: UI enable/disable, defaults/units, catalog assignment, exact cancellation/no-op, native serialization/reload, legacy ignition preservation, atomic refusal and mobile layout.`);
} finally { await browser.close(); }
