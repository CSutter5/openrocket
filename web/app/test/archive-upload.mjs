import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { zipSync } from 'fflate';
import { chromium } from 'playwright';
import { importArchive, LIMITS } from '../../packages/ork-format/src/index.js';
import { cloudflareFixture, register, editorReady } from './cloudflare-fixture.mjs';

let browser;
const sample = new Uint8Array(await readFile(new URL('../public/explicit-tube.ork', import.meta.url)));
const sampleArchive = await importArchive(sample);
const largeXml = new TextEncoder().encode(sampleArchive.xml.replace('</openrocket>', '<!--' + 'saved-flight-size-regression '.repeat(400000) + '--></openrocket>'));
const input = process.env.ORK_PROOF_INPUT ? await readFile(process.env.ORK_PROOF_INPUT) : Buffer.from(zipSync({ 'rocket.ork': largeXml }));
const filename = process.env.ORK_PROOF_INPUT ? basename(process.env.ORK_PROOF_INPUT) : 'large-flight.ork';
const imported = await importArchive(new Uint8Array(input));
assert.ok(imported.entries[0].bytes.length > 8 * 1024 * 1024);
assert.ok(input.length <= LIMITS.upload);
const host = await cloudflareFixture(8798), { url } = host;

try {
  await host.start();browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await register(page, url, 'upload-regression');
  for (const name of ['First rocket', 'Second rocket']) {
    const response = await page.context().request.post(url + '/api/rockets', { headers: { Origin: url }, data: { name } });
    assert.equal(response.status(), 201, await response.text());
  }
  await page.reload();
  await page.getByLabel('Rocket file (.ork)', { exact: true }).setInputFiles({ name: filename, mimeType: 'application/octet-stream', buffer: input });
  await page.getByLabel('Uploaded rocket name', { exact: true }).fill('Third rocket');
  await page.getByRole('button', { name: 'Upload rocket', exact: true }).click();
  await page.waitForURL(url + '/upload-regression/third-rocket/');await editorReady(page);
  async function download() {
    const pending = page.waitForEvent('download');await page.getByRole('button', { name: 'Download .ork', exact: true }).click();
    return readFile(await (await pending).path());
  }
  assert.deepEqual(await download(), input);
  assert.equal((await (await page.context().request.get(url + '/api/rockets')).json()).rockets.length, 3);
  await page.goto(url);
  const oversizedEntry = zipSync({ 'rocket.ork': new Uint8Array(LIMITS.entry + 1) });
  await page.getByLabel('Rocket file (.ork)', { exact: true }).setInputFiles({ name: 'entry-too-large.ork', mimeType: 'application/octet-stream', buffer: Buffer.from(oversizedEntry) });
  await page.getByRole('button', { name: 'Upload rocket', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Archive entry "rocket.ork" expands to 16777217 bytes; the per-entry limit is 16 MiB' }).waitFor();
  const oversizedTotal = zipSync({ 'rocket.ork': sampleArchive.entries[0].bytes, 'first.bin': new Uint8Array(8 * 1024 * 1024), 'second.bin': new Uint8Array(8 * 1024 * 1024) });
  await page.getByLabel('Rocket file (.ork)', { exact: true }).setInputFiles({ name: 'total-too-large.ork', mimeType: 'application/octet-stream', buffer: Buffer.from(oversizedTotal) });
  await page.getByRole('button', { name: 'Upload rocket', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'the total expanded limit per upload is 16 MiB' }).waitFor();
  assert.equal((await (await page.context().request.get(url + '/api/rockets')).json()).rockets.length, 3);
  await host.stop();await host.start();
  await page.goto(url + '/upload-regression/third-rocket/');await editorReady(page);
  assert.deepEqual(await download(), input);assert.deepEqual(errors, []);
  console.log(`Large archive upload passed in Chromium ${browser.version()}: third owned rocket, ${input.length} uploaded/${imported.entries[0].bytes.length} XML bytes, exact original download, explicit entry/total rejection without metadata publication, and restart preservation (${imported.parsed.simulations.length} stored simulations).`);
} catch (error) { console.error(host.log);throw error; }
finally { await browser?.close();await host.close(); }
