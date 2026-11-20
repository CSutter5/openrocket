import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { chromium } from 'playwright';
import { zipSync } from 'fflate';
import { importArchive } from '../../packages/ork-format/src/index.js';
import { openSample, openProperties } from './workspace.mjs';
const app = resolve(import.meta.dirname, '..'), url = 'http://127.0.0.1:8791';
const storage = await mkdtemp(resolve(tmpdir(), 'ork-coedit-'));
let server, browser, log = '';
async function start() {
  log = '';
  server = spawn(process.execPath, [resolve(app, '../node_modules/wrangler/bin/wrangler.js'), 'dev', '--local', '--ip', '127.0.0.1', '--port', '8791', '--persist-to', storage], {
    cwd: app, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: resolve(storage, 'logs') }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', data => { log += data; }); server.stderr.on('data', data => { log += data; });
  for (let i = 0; i < 200; i++) {
    assert.equal(server.exitCode, null, log);
    try { if (log.includes('Ready on') && (await fetch(url + '/api/coedit')).ok) return; } catch {}
    await setTimeout(100);
  }
  throw new Error('Wrangler did not start: ' + log);
}
async function stop() { if (!server || server.exitCode !== null) return; const ended = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await ended; }
async function join(page, username) {
  await page.goto(url);
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByRole('button', { name: 'Join shared file', exact: true }).click();
  await page.locator('.session-label').filter({ hasText: 'Connected' }).waitFor();
  await page.locator('.component-tree button').first().waitFor();
}
async function download(page) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .ork', exact: true }).click();
  const file = await event; assert.equal(await file.failure(), null); return readFile(await file.path());
}
// Protocol clients in a browser receive its real same-origin WebSocket handshake.
async function raw(page, key) {
  return page.evaluate(async key => {
    const socket = new WebSocket(`${location.origin.replace('http', 'ws')}/api/coedit/socket?username=${key}`);
    const client = { socket, messages: [], state: null };
    window[key] = client;
    await new Promise((resolve, reject) => {
      socket.onerror = reject;
      socket.onmessage = event => { const message = JSON.parse(event.data);client.messages.push(message);if (message.type === 'state') { client.state = message.state;resolve(); } };
    });
    return client.state;
  }, key);
}
try {
  await start();
  assert.equal((await fetch(url + '/api/coedit/socket', { headers: { Origin: 'https://elsewhere.test' } })).status, 403);
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  const a = await browser.newPage(), b = await browser.newPage(), errors = [];
  for (const page of [a, b]) page.on('pageerror', error => errors.push(error.message));
  await join(a, 'Alice'); await join(b, 'Bob');
  await a.getByLabel('Collaborators', { exact: true }).filter({ hasText: 'Alice' }).filter({ hasText: 'Bob' }).waitFor();
  await openSample(a, 'Open explicit tube sample');
  await b.getByRole('button', { name: 'Tube bodytube', exact: true }).waitFor();
  await a.getByRole('button', { name: 'Tube bodytube', exact: true }).click();
  await openProperties(a);
  await b.getByRole('button', { name: 'Tube bodytube', exact: true }).click();
  await openProperties(b, { advanced: false });
  await b.getByLabel('Component name', { exact: true }).fill('Bob unsaved draft');
  await a.getByLabel('Component name', { exact: true }).fill('Shared tube');
  await a.getByRole('button', { name: 'Apply name', exact: true }).click();
  await b.getByRole('button', { name: 'Shared tube bodytube', exact: true }).waitFor();
  assert.equal(await b.getByLabel('Component name', { exact: true }).inputValue(), 'Bob unsaved draft');
  await b.getByRole('button', { name: 'OK', exact: true }).click();
  await b.getByRole('alert').filter({ hasText: 'Your draft is kept' }).waitFor();
  assert.equal(await b.getByLabel('Component name', { exact: true }).inputValue(), 'Bob unsaved draft');
  await b.getByRole('button', { name: 'Cancel', exact: true }).click();
  await a.getByLabel('BodyTube outer radius (m)', { exact: true }).fill('0.03');
  await a.getByRole('button', { name: 'Apply radius', exact: true }).click();
  await a.getByTestId('radius').filter({ hasText: '0.03' }).waitFor();
  await b.getByRole('button', { name: 'Shared tube bodytube', exact: true }).click(); await openProperties(b);
  await b.getByTestId('radius').filter({ hasText: '0.03' }).waitFor();
  assert.deepEqual(await download(a), await download(b));
  const first = await raw(a, 'rawA'); await raw(b, 'rawB');
  const archive = await importArchive(new Uint8Array(first.snapshot.bytes), first.snapshot.identity);
  const tube = archive.parsed.components.find(node => node.name === 'bodytube');
  const command = { expectedToken: first.token, action: { type: 'rename', id: tube.id, expected: 'Shared tube', value: 'Race A' } };
  await Promise.all([a.evaluate(command => window.rawA.socket.send(JSON.stringify({ ...command, requestId: 'race-a' })), command),
    b.evaluate(command => window.rawB.socket.send(JSON.stringify({ ...command, requestId: 'race-b', action: { ...command.action, value: 'Race B' } })), command)]);
  await Promise.all([a.waitForFunction(() => window.rawA.messages.some(m => m.requestId === 'race-a')), b.waitForFunction(() => window.rawB.messages.some(m => m.requestId === 'race-b'))]);
  const results = [await a.evaluate(() => window.rawA.messages.find(m => m.requestId === 'race-a')), await b.evaluate(() => window.rawB.messages.find(m => m.requestId === 'race-b'))];
  assert.equal(results.filter(m => m.type === 'state').length, 1); assert.equal(results.filter(m => m.type === 'rejected').length, 1);
  const winner = results.find(m => m.type === 'state');
  await a.getByRole('button', { name: /^Race [AB] bodytube$/ }).waitFor(); await b.getByRole('button', { name: /^Race [AB] bodytube$/ }).waitFor();
  let accepted = await download(a); assert.deepEqual(accepted, await download(b));
  for (const [id, action] of [
    ['invalid-radius', { type: 'radius', id: tube.id, expected: 0.03, value: -1 }],
    ['invalid-import', { type: 'import', filename: 'bad.ork', bytes: [0, 1, 2] }],
    ['forged-sync', { type: 'sync', ...winner.state.snapshot }],
    ['stale-component', { type: 'componentTree', expectedHash: 'old', id: tube.id, operation: 'delete' }],
  ]) {
    await a.evaluate(({ id, action }) => window.rawA.socket.send(JSON.stringify({ requestId: id, expectedToken: window.rawA.state.token, action })), { id, action });
    await a.waitForFunction(id => window.rawA.messages.some(m => m.requestId === id && m.type === 'rejected'), id);
  }
  assert.deepEqual(await download(a), accepted);
  await a.getByRole('button', { name: 'Close Component editor', exact: true }).click();
  await a.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await a.waitForFunction(() => document.querySelectorAll('.component-tree [aria-label$=" bodytube"]').length === 2);
  await b.waitForFunction(() => document.querySelectorAll('.component-tree [aria-label$=" bodytube"]').length === 2);
  await a.getByRole('button', { name: 'Delete', exact: true }).click();
  await b.waitForFunction(() => document.querySelectorAll('.component-tree [aria-label$=" bodytube"]').length === 1);
  accepted = await download(a); assert.deepEqual(accepted, await download(b));
  // Incompressible opaque bytes force the durable draft across multiple storage chunks.
  const current = await importArchive(new Uint8Array(accepted));
  const opaque = new Uint8Array(160000); let seed = 123456789;
  for (let i = 0; i < opaque.length; i++) { seed ^= seed << 13;seed ^= seed >>> 17;seed ^= seed << 5;opaque[i] = seed & 255; }
  const uploaded = zipSync({ ...Object.fromEntries(current.entries.map(entry => [entry.path, entry.bytes])), 'opaque.bin': opaque });
  assert.ok(uploaded.length > 2 * 64 * 1024);
  await a.getByLabel('Open local .ork', { exact: true }).setInputFiles({ name: 'shared-assets.ork', mimeType: 'application/octet-stream', buffer: Buffer.from(uploaded) });
  await a.locator('.filename').filter({ hasText: 'shared-assets.ork' }).waitFor();
  await b.locator('.filename').filter({ hasText: 'shared-assets.ork' }).waitFor();
  accepted = await download(a); assert.deepEqual(accepted, Buffer.from(uploaded));assert.deepEqual(accepted, await download(b));
  await a.screenshot({ path: resolve(app, 'build/coediting.png') });
  await a.evaluate(() => window.rawA.socket.close()); await b.evaluate(() => window.rawB.socket.close());
  await b.close();
  await a.getByLabel('Collaborators', { exact: true }).filter({ hasText: 'Editing together (1): Alice' }).waitFor();
  await stop();
  await a.locator('.session-label').filter({ hasText: 'Reconnecting' }).waitFor();
  assert.equal(await a.getByRole('button', { name: 'Download .ork', exact: true }).isDisabled(), true);
  await start();
  await a.locator('.session-label').filter({ hasText: 'Connected' }).waitFor();
  assert.deepEqual(await download(a), accepted);
  const late = await browser.newPage(); await join(late, 'Charlie'); assert.deepEqual(await download(late), accepted);
  assert.deepEqual(errors, []);
  console.log(`Coediting passed in Chromium ${browser.version()}: two isolated browsers, presence, rename/radius convergence, equal downloads, concurrent conflict, stale dialog draft retention, invalid command/import preservation, subtree duplicate/delete, opaque assets across storage chunks, disconnect, durable restart and late join.`);
} catch (error) { console.error(log); throw error; }
finally { await browser?.close(); await stop(); await rm(storage, { recursive: true, force: true }); }
