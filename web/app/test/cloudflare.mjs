import { openSample, openProperties, closeProperties, flights } from './workspace.mjs';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { cloudflareFixture, register, createRocket } from './cloudflare-fixture.mjs';
import { importArchive } from '../../packages/ork-format/src/index.js';

const app = resolve(import.meta.dirname, '..'), host = await cloudflareFixture(8793), { url } = host;
let browser;
try {
  await host.start();
  const files = await readdir(resolve(app, 'dist'), { recursive: true, withFileTypes: true });
  for (const file of files.filter(entry => entry.isFile())) {
    const path = resolve(file.parentPath, file.name);
    const asset = relative(resolve(app, 'dist'), path).split(sep).join('/');
    const response = await fetch(`${url}/${asset === 'index.html' ? '' : asset}`);
    assert.equal(response.status, 200, asset);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(path), asset);
    if (asset.endsWith('.js')) assert.match(response.headers.get('content-type'), /javascript/, asset);
    if (asset.endsWith('.css')) assert.match(response.headers.get('content-type'), /text\/css/, asset);
  }
  for (const path of ['/assets/missing.js', '/api/projects', '/.env', '/src/main.tsx']) {
    assert.equal((await fetch(url + path)).status, 404, path);
  }

  browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage(), errors = [], requests = [], workers = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  page.on('worker', worker => workers.push(worker.url()));
  await register(page, url, 'cloudflare-smoke');
  await createRocket(page, url, 'cloudflare-smoke', 'smoke');
  await openSample(page, 'Open explicit tube sample');
  await openProperties(page);
  await page.getByRole('button', { name: 'Tube bodytube', exact: true }).click();
  await page.getByLabel('Component name', { exact: true }).fill('Cloudflare local tube');
  await page.getByRole('button', { name: 'Apply name', exact: true }).click();
  await page.getByRole('heading', { name: 'Cloudflare local tube', exact: true }).waitFor();
  await page.getByLabel('BodyTube outer radius (m)', { exact: true }).fill('0.03');
  await page.getByRole('button', { name: 'Apply radius', exact: true }).click();
  await page.getByTestId('radius').filter({ hasText: '0.03' }).waitFor();
  async function download() {
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download .ork', exact: true }).click();
    const file = await event;
    assert.equal(await file.failure(), null);
    return readFile(await file.path());
  }
  const edited = await download();
  const archive = await importArchive(new Uint8Array(edited));
  assert.equal(archive.parsed.components.find(node => node.name === 'bodytube')
    .children.find(node => node.name === 'name').text, 'Cloudflare local tube');
  await page.getByLabel('Open local .ork').setInputFiles({ name: 'edited.ork',
    mimeType: 'application/octet-stream', buffer: edited });
  await page.getByRole('button', { name: 'Cloudflare local tube bodytube', exact: true }).click();
  assert.equal(await page.getByTestId('radius').textContent(), '0.03');
  assert.deepEqual(await download(), edited);

  await openSample(page, 'Open flight-ready sample');
  await page.getByRole('status').filter({ hasText: 'Archive opened.' }).waitFor();
  await closeProperties(page);
  await page.getByRole('dialog', { name: 'Component editor', exact: true }).waitFor({ state: 'detached' });
  await flights(page);
  await page.getByRole('tab', { name: 'Motors & Configuration', exact: true }).click();
  await page.getByRole('button', { name: 'New configuration', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'New configuration', exact: true });
  await picker.getByLabel('Search motors', { exact: true }).fill('Estes C6');
  await picker.locator('input[name="catalog-motor"]').first().check();
  await picker.getByLabel('Ejection delay (seconds or none)', { exact: true }).fill('3');
  await picker.getByRole('button', { name: 'Create configuration', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Configuration and linked simulation created.' }).waitFor();
  const configured = await download();
  assert.equal((await importArchive(new Uint8Array(configured))).parsed.simulations.length, 1);
  await flights(page);
  const panel = page.getByRole('region', { name: 'Flight simulations', exact: true });
  await panel.getByRole('button', { name: 'Run flight', exact: true }).click();
  try { await page.getByTestId('flight-status').filter({ hasText: 'Flight completed.' }).waitFor({ timeout: 30000 }); }
  catch (error) { throw new Error(`${error.message} Status: ${await page.getByTestId('flight-status').textContent()}; alerts: ${await page.getByRole('alert').allTextContents()}`); }
  await panel.locator('.simulation-table').getByText('Completed', { exact: true }).waitFor();
  assert.deepEqual(await download(), configured);
  assert.ok(workers.some(worker => worker.includes('/assets/document.worker-')));
  assert.ok(workers.some(worker => worker.includes('/assets/simulation.worker-')));
  assert.deepEqual(errors, []);
  assert.deepEqual(requests.filter(request => !request.startsWith(url + '/')), []);
  console.log(`Cloudflare local smoke passed in Chromium ${browser.version()}: asset bytes/MIME, 404s, edit/download/reimport and browser flight.`);
} finally {
  try { await browser?.close(); } finally { await host.close(); }
}
