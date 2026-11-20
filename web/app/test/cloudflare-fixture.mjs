import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
const app = resolve(import.meta.dirname, '..'), wrangler = resolve(app, '../node_modules/wrangler/bin/wrangler.js');
export const testPassword = 'local-account-test-password-2026';
export async function cloudflareFixture(port) {
  const storage = await mkdtemp(resolve(tmpdir(), 'ork-cloudflare-test-')), url = `http://127.0.0.1:${port}`;
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: resolve(storage, 'logs'), CI: '1', AUTH_SECRET: 'local-only-test-secret-never-use-in-production-2026' };
  let server, log = '', migrated = false;
  async function command(args) {
    const child = spawn(process.execPath, [wrangler, ...args], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';child.stdout.on('data', data => { output += data; });child.stderr.on('data', data => { output += data; });
    const status = await new Promise(resolve => child.once('exit', resolve));
    assert.equal(status, 0, output);return output;
  }
  async function start() {
    if (!migrated) { await command(['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', storage]);migrated = true; }
    log = '';
    server = spawn(process.execPath, [wrangler, 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', storage,
      '--var', `AUTH_BASE_URL:${url}`], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', data => { log += data; });server.stderr.on('data', data => { log += data; });
    for (let i = 0; i < 250; i++) {
      assert.equal(server.exitCode, null, log);
      try { if (log.includes('Ready on') && (await fetch(url + '/api/coedit')).ok) return; } catch {}
      await setTimeout(100);
    }
    throw new Error('Wrangler did not start: ' + log);
  }
  async function stop() { if (!server || server.exitCode !== null) return;const ended = new Promise(resolve => server.once('exit', resolve));server.kill('SIGTERM');await ended; }
  return { url, start, stop, get log() { return log; }, async close() { await stop();await rm(storage, { recursive: true, force: true }); } };
}
export async function register(page, url, username) {
  await page.goto(url);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Create account', exact: true });
  await form.getByLabel('Username', { exact: true }).fill(username);
  await form.getByLabel('Email', { exact: true }).fill(`${username.toLowerCase()}@example.test`);
  await form.getByLabel('Password', { exact: true }).fill(testPassword);
  await form.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByText(`Signed in as ${username.toLowerCase()}`, { exact: true }).waitFor();
}
export async function createRocket(page, url, username, slug, name = slug) {
  await page.goto(url);
  await page.getByLabel('Rocket name', { exact: true }).fill(name);
  await page.getByLabel('URL name', { exact: true }).fill(slug);
  await page.getByRole('button', { name: 'Create rocket', exact: true }).click();
  await page.waitForURL(`${url}/${username}/${slug}/`);await editorReady(page);
  return `/${username}/${slug}/`;
}
export async function editorReady(page) {
  await page.locator('.session-label').filter({ hasText: 'Connected' }).waitFor();
  await page.locator('.component-tree button').first().waitFor();
}
export async function rawSocket(page, key, path) {
  const socketPath = path ?? `/api/rockets${new URL(page.url()).pathname}socket`;
  return page.evaluate(async ({ key, socketPath }) => {
    const socket = new WebSocket(`${location.origin.replace('http', 'ws')}${socketPath}`);
    const client = { socket, messages: [], state: null };window[key] = client;
    await new Promise((resolve, reject) => {
      socket.onerror = reject;
      socket.onmessage = event => { const message = JSON.parse(event.data);client.messages.push(message);if (message.type === 'state') { client.state = message.state;resolve(); } };
    });
    return client.state;
  }, { key, socketPath });
}
