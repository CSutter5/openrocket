import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { cloudflareFixture, register, createRocket, editorReady, rawSocket, shareRocket, testPassword } from './cloudflare-fixture.mjs';
const host = await cloudflareFixture(8796), { url } = host;
let browser;
async function api(page, path, method = 'GET', data, origin = url) {
  return page.context().request.fetch(url + path, { method, headers: { Origin: origin }, ...(data === undefined ? {} : { data }) });
}
async function command(page, key, requestId, action) {
  await page.evaluate(({ key, requestId, action }) => window[key].socket.send(JSON.stringify({ requestId, expectedToken: window[key].state.token, action })), { key, requestId, action });
  await page.waitForFunction(({ key, requestId }) => window[key].messages.some(m => m.requestId === requestId), { key, requestId });
  return page.evaluate(({ key, requestId }) => window[key].messages.find(m => m.requestId === requestId), { key, requestId });
}
async function blockedSocket(page, path) {
  return page.evaluate(path => new Promise(resolve => {
    const socket = new WebSocket(location.origin.replace('http', 'ws') + path);
    socket.onopen = () => { socket.close();resolve(false); };socket.onerror = () => resolve(true);
  }), path);
}
try {
  await host.start();browser = await chromium.launch({ headless: true });
  const alice = await browser.newPage(), bob = await browser.newPage(), eve = await browser.newPage(), guest = await browser.newPage(), errors = [];
  for (const page of [alice, bob, eve, guest]) page.on('pageerror', error => errors.push(error.message));
  await register(alice, url, 'alice');const path = await createRocket(alice, url, 'alice', 'Secret design');
  await register(bob, url, 'bob');await register(eve, url, 'eve');await guest.goto(url);
  const base = '/api/rockets' + path.slice(0, -1), { rocket } = await (await api(alice, base)).json();
  assert.equal(rocket.visibility, 'restricted');
  const sharing = base + `/sharing?rocketId=${rocket.id}`, download = base + `/download?rocketId=${rocket.id}`;
  const original = await (await api(alice, download)).body(), denied = { type: 'rename', id: 'unknown', expected: '', value: 'Denied' };
  for (const page of [bob, eve, guest]) {
    for (const endpoint of [base, download, sharing]) assert.equal((await api(page, endpoint)).status(), 404);
    for (const directory of ['/api/rockets', '/api/rockets?owner=alice']) assert.equal((await (await api(page, directory)).json()).rockets.length, 0);
    assert.equal(await blockedSocket(page, base + '/socket?username=alice'), true);
  }
  const publish = { rocketId: rocket.id, expectedVersion: 0, operation: 'visibility', visibility: 'public', publicDownload: true };
  assert.equal((await api(alice, sharing, 'POST', publish, 'https://elsewhere.test')).status(), 403);
  assert.equal((await api(alice, sharing, 'POST', { ...publish, rocketId: 'wrong-id' })).status(), 409);
  await alice.getByRole('button', { name: 'Share', exact: true }).click();
  const dialog = alice.getByRole('dialog', { name: 'Share rocket', exact: true });
  await dialog.getByLabel('Username to share with', { exact: true }).fill('BOB');
  await dialog.getByRole('button', { name: 'Add or update user', exact: true }).click();await dialog.getByLabel('Role for bob', { exact: true }).waitFor();
  assert.equal((await (await api(bob, '/api/rockets')).json()).rockets.length, 1);
  assert.equal((await api(bob, sharing)).status(), 403);
  assert.equal((await api(bob, sharing, 'POST', { ...publish, expectedVersion: 1 })).status(), 403);
  assert.equal((await api(bob, base + '/rename', 'POST', { rocketId: rocket.id, expectedName: rocket.name, name: 'Forged' })).status(), 403);
  assert.equal((await api(bob, base + `?rocketId=${rocket.id}`, 'DELETE')).status(), 403);
  await bob.goto(url + path);await editorReady(bob);await rawSocket(bob, 'rawBob');
  assert.equal(await bob.getByRole('button', { name: 'Duplicate', exact: true }).isDisabled(), true);
  assert.equal(await bob.getByRole('button', { name: 'Download .ork', exact: true }).isDisabled(), true);
  assert.equal((await api(bob, download)).status(), 403);
  const viewerDenied = await command(bob, 'rawBob', 'viewer-forged-edit', denied);
  assert.equal(viewerDenied.type, 'rejected');assert.match(viewerDenied.error, /editor access/);
  await dialog.getByLabel('Role for bob', { exact: true }).selectOption('editor');
  await bob.waitForFunction(() => !document.querySelector('.file-open input').disabled);
  assert.equal((await api(bob, download)).status(), 403);
  await rawSocket(alice, 'rawAlice');const root = await alice.locator('.component-tree button').first().getAttribute('data-component-id');
  assert.equal((await command(bob, 'rawBob', 'editor-rename', { type: 'rename', id: root, expected: 'Secret design', value: 'Shared secret' })).type, 'state');
  await alice.getByRole('button', { name: 'Shared secret rocket', exact: true }).waitFor();
  await dialog.getByLabel('Allow downloads for bob', { exact: true }).check();
  await bob.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Download .ork').disabled);
  const event = bob.waitForEvent('download');await bob.getByRole('button', { name: 'Download .ork', exact: true }).click();
  assert.deepEqual(await readFile(await (await event).path()), await (await api(alice, download)).body());
  await dialog.getByLabel('Role for bob', { exact: true }).selectOption('viewer');
  await bob.waitForFunction(() => document.querySelector('.file-open input').disabled);
  assert.equal((await command(bob, 'rawBob', 'downgraded-edit', denied)).type, 'rejected');
  await dialog.getByLabel('Allow downloads for bob', { exact: true }).uncheck();
  await bob.waitForFunction(() => Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Download .ork').disabled);
  assert.equal((await api(bob, download)).status(), 403);
  const stale = (await (await api(alice, sharing)).json()).rocket.sharingVersion;
  await shareRocket(alice, url, path, { operation: 'member', username: 'eve', role: 'viewer', canDownload: false });
  assert.equal((await api(alice, sharing, 'POST', { rocketId: rocket.id, expectedVersion: stale, operation: 'remove', username: 'eve' })).status(), 409);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();await alice.getByRole('button', { name: 'Share', exact: true }).click();
  await dialog.getByLabel('Role for eve', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Remove bob', exact: true }).click();
  await bob.getByRole('alert').filter({ hasText: 'Access to this rocket is no longer available' }).waitFor();
  await bob.waitForFunction(() => window.rawBob.messages.some(m => m.type === 'revoked') && window.rawBob.socket.readyState === WebSocket.CLOSED);
  assert.equal(await bob.locator('.component-tree button').count(), 0);assert.equal((await api(bob, base)).status(), 404);
  const states = await bob.evaluate(() => window.rawBob.messages.filter(m => m.type === 'state').length);
  assert.equal((await command(alice, 'rawAlice', 'after-revoke', { type: 'rename', id: root, expected: 'Shared secret', value: 'After revocation' })).type, 'state');
  assert.equal(await bob.evaluate(() => window.rawBob.messages.filter(m => m.type === 'state').length), states);
  await dialog.getByLabel('Who can view', { exact: true }).selectOption('public');
  await guest.goto(url + path);await editorReady(guest);await rawSocket(guest, 'rawGuest');
  await bob.goto(url + path);await editorReady(bob);await rawSocket(bob, 'publicBob');
  assert.equal((await api(guest, download)).status(), 403);
  assert.equal((await command(bob, 'publicBob', 'public-forged-edit', denied)).type, 'rejected');
  await dialog.getByLabel('Allow public downloads', { exact: true }).check();
  assert.equal((await api(guest, download)).status(), 200);assert.equal((await api(eve, download)).status(), 403);
  await dialog.getByLabel('Who can view', { exact: true }).selectOption('restricted');
  await guest.getByRole('alert').filter({ hasText: 'Access to this rocket is no longer available' }).waitFor();
  await bob.getByRole('alert').filter({ hasText: 'Access to this rocket is no longer available' }).waitFor();
  assert.equal((await api(guest, download)).status(), 404);
  // A private reader whose session is revoked receives no subsequent archive broadcast.
  await eve.goto(url + path);await editorReady(eve);await rawSocket(eve, 'expired');
  const priorStates = await eve.evaluate(() => window.expired.messages.filter(m => m.type === 'state').length);
  assert.equal((await api(eve, '/api/auth/sign-out', 'POST', {})).status(), 200);
  assert.equal((await command(alice, 'rawAlice', 'after-session-revoke', { type: 'rename', id: root, expected: 'After revocation', value: 'After logout' })).type, 'state');
  await eve.getByRole('alert').filter({ hasText: 'Access to this rocket is no longer available' }).waitFor();
  assert.equal(await eve.evaluate(() => window.expired.messages.filter(m => m.type === 'state').length), priorStates);
  assert.equal((await api(eve, '/api/auth/sign-in/username', 'POST', { username: 'eve', password: testPassword })).status(), 200);
  // A conflicting slug under the recipient must not change the original share URL.
  await createRocket(bob, url, 'bob', 'Secret design');
  await dialog.getByLabel('New owner username', { exact: true }).fill('bob');
  await dialog.getByRole('button', { name: 'Transfer ownership…', exact: true }).click();
  const confirmation = alice.getByRole('dialog', { name: 'Transfer ownership', exact: true });
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal((await (await api(alice, base)).json()).rocket.ownerId, rocket.ownerId);
  await alice.setViewportSize({ width: 390, height: 844 });const bounds = await dialog.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844);
  assert.equal(await alice.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await alice.screenshot({ path: resolve(import.meta.dirname, '../build/sharing-phone.png') });await alice.setViewportSize({ width: 1280, height: 720 });
  const beforeTransfer = await (await api(alice, download)).body();
  await dialog.getByRole('button', { name: 'Transfer ownership…', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Transfer ownership', exact: true }).click();await dialog.waitFor({ state: 'detached' });
  await alice.getByRole('button', { name: 'Share', exact: true }).waitFor({ state: 'detached' });
  const transferred = (await (await api(bob, base)).json()).rocket;
  assert.equal(transferred.id, rocket.id);assert.equal(transferred.username, 'bob');assert.equal(transferred.routeUsername, 'alice');
  assert.equal((await api(alice, sharing)).status(), 403);assert.deepEqual(await (await api(bob, download)).body(), beforeTransfer);
  const members = (await (await api(bob, sharing)).json()).members;assert.equal(members.find(m => m.username === 'alice').role, 'editor');assert.equal(members.find(m => m.username === 'alice').canDownload, true);
  assert.equal((await (await api(bob, '/api/rockets?owner=bob')).json()).rockets.length, 2);
  assert.equal((await (await api(alice, '/api/rockets?owner=alice')).json()).rockets.length, 0);
  await bob.goto(url + path);await editorReady(bob);await bob.getByRole('button', { name: 'Rename rocket', exact: true }).click();
  const rename = bob.getByRole('dialog', { name: 'Rename rocket', exact: true });await rename.getByLabel('Rocket name', { exact: true }).fill('Transferred design');
  await rename.getByRole('button', { name: 'Rename rocket', exact: true }).click();await rename.waitFor({ state: 'detached' });
  assert.equal((await (await api(bob, base)).json()).rocket.name, 'Transferred design');
  await shareRocket(bob, url, path, { operation: 'remove', username: 'alice' });
  await alice.getByRole('alert').filter({ hasText: 'Access to this rocket is no longer available' }).waitFor();assert.equal((await api(alice, download)).status(), 404);
  const admin = await browser.newPage();
  assert.equal((await api(admin, '/api/auth/sign-in/username', 'POST', { username: 'admin', password: 'admin' })).status(), 200);
  assert.equal((await api(admin, base)).status(), 404);
  assert.equal((await api(admin, '/api/account/password', 'POST', { currentPassword: 'admin', newPassword: testPassword })).status(), 200);
  assert.equal((await api(admin, base)).status(), 200);assert.equal((await api(admin, download)).status(), 200);
  const adminSharing = (await (await api(admin, sharing)).json()).rocket;
  assert.equal((await api(admin, sharing, 'POST', { rocketId: rocket.id, expectedVersion: adminSharing.sharingVersion, operation: 'transfer', username: 'eve' })).status(), 403);
  assert.equal((await api(admin, `/api/admin/users/${rocket.ownerId}`, 'DELETE')).status(), 200);
  assert.equal((await api(bob, base)).status(), 200);assert.deepEqual(await (await api(bob, download)).body(), beforeTransfer);
  await host.stop();await host.start();await bob.reload();await editorReady(bob);
  assert.deepEqual(await (await api(bob, download)).body(), beforeTransfer);assert.equal((await api(alice, base)).status(), 404);assert.equal((await api(eve, download)).status(), 403);
  const persisted = await (await api(bob, sharing)).json();assert.equal(persisted.rocket.ownerId, transferred.ownerId);assert.equal(persisted.members.length, 1);
  await bob.getByRole('button', { name: 'Delete rocket', exact: true }).click();
  await bob.getByRole('dialog', { name: 'Delete rocket', exact: true }).getByRole('button', { name: 'Delete rocket', exact: true }).click();await bob.waitForURL(url + '/');
  assert.equal((await api(bob, base)).status(), 404);
  assert.notDeepEqual(beforeTransfer, original);assert.deepEqual(errors, []);
  console.log(`Sharing passed in Chromium ${browser.version()}: restricted defaults, HTTP/socket isolation, viewer/editor grants, live role/download changes, revocation without later snapshots, public view-only access, selected download overrides, stale versions, CSRF, transfer confirmation/cancel, stable URLs and bytes with colliding slugs, former-owner removal, rename after transfer, restart and phone layout.`);
} catch (error) { console.error(host.log);throw error; }
finally { await browser?.close();await host.close(); }
