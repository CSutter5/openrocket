import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { cloudflareFixture, register, createRocket, rawSocket, testPassword, shareRocket } from './cloudflare-fixture.mjs';

const host = await cloudflareFixture(8799), { url } = host;
const temporary = 'temporary-account-password-2026', replacement = 'replacement-account-password-2026';
let browser;
async function api(page, path, data, method = 'POST', origin = url) {
  return page.context().request.fetch(url + path, { method, headers: { Origin: origin }, ...(data === undefined ? {} : { data }) });
}
async function session(page) { return (await (await api(page, '/api/session', undefined, 'GET')).json()).user; }
async function login(page, username, password) { return api(page, '/api/auth/sign-in/username', { username, password }); }

try {
  await host.start();browser = await chromium.launch({ headless: true });
  const owner = await browser.newPage(), other = await browser.newPage(), admin = await browser.newPage(), guest = await browser.newPage(), old = await browser.newPage(), racing = await browser.newPage(), errors = [];
  for (const page of [owner, other, admin, guest, old, racing]) page.on('pageerror', error => errors.push(error.message));
  await register(owner, url, 'alice');const user = await session(owner);
  const rocketPath = await createRocket(owner, url, 'alice', 'Private rocket');
  const publicPath = await createRocket(owner, url, 'alice', 'Public rocket');
  await shareRocket(owner, url, publicPath, { operation: 'visibility', visibility: 'public', publicDownload: true });
  const rocket = (await (await api(owner, '/api/rockets' + publicPath.slice(0, -1), undefined, 'GET')).json()).rocket;
  await rawSocket(owner, 'beforeReset');
  assert.equal((await login(old, 'alice', testPassword)).status(), 200);
  await register(other, url, 'bob');
  const endpoint = `/api/admin/users/${user.id}/password`, resetBody = { temporaryPassword: temporary };
  assert.equal((await api(guest, endpoint, resetBody)).status(), 401);
  assert.equal((await api(other, endpoint, resetBody)).status(), 403);
  assert.equal((await login(admin, 'admin', 'admin')).status(), 200);
  assert.equal((await api(admin, endpoint, resetBody)).status(), 403);
  assert.equal((await api(admin, '/api/account/password', { currentPassword: 'admin', newPassword: testPassword })).status(), 200);
  const administrator = await session(admin);
  assert.equal((await api(admin, `/api/admin/users/${administrator.id}/password`, resetBody)).status(), 403);
  assert.equal((await api(admin, '/api/admin/users/missing/password', resetBody)).status(), 404);
  assert.equal((await api(admin, endpoint, resetBody, 'POST', 'https://other.test')).status(), 403);
  for (const temporaryPassword of [undefined, 5, '', 'short', 'x'.repeat(129)]) assert.equal((await api(admin, endpoint, { temporaryPassword })).status(), 400);
  assert.equal((await login(guest, 'alice', testPassword)).status(), 200);await api(guest, '/api/auth/sign-out', {});

  await admin.goto(url + '/admin/');
  const row = admin.locator(`tr[data-user-id="${user.id}"]`);
  await row.getByRole('button', { name: 'Reset password', exact: true }).click();
  let dialog = admin.getByRole('dialog', { name: 'Reset password', exact: true });
  await dialog.getByLabel('Temporary password', { exact: true }).fill(temporary);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();assert.equal((await session(owner)).mustChangePassword, false);
  await row.getByRole('button', { name: 'Reset password', exact: true }).click();
  await dialog.getByLabel('Temporary password', { exact: true }).fill(temporary);
  await dialog.getByLabel('Confirm temporary password', { exact: true }).fill(temporary + 'mismatch');
  await dialog.getByRole('button', { name: 'Set temporary password', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'do not match' }).waitFor();assert.ok(await session(owner));
  await dialog.getByLabel('Confirm temporary password', { exact: true }).fill(temporary);
  await admin.setViewportSize({ width: 390, height: 844 });
  assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('dialog').scrollWidth <= document.querySelector('dialog').clientWidth), true);
  await admin.setViewportSize({ width: 1280, height: 720 });
  const racedLogin = login(racing, 'alice', testPassword);
  await dialog.getByRole('button', { name: 'Set temporary password', exact: true }).click();await dialog.waitFor({ state: 'detached' });
  await row.getByText(/Password change required/).waitFor();await admin.getByRole('status').filter({ hasText: 'Temporary password set for alice' }).waitFor();await racedLogin;
  for (const page of [owner, old, racing]) assert.equal(await session(page), null);
  await owner.evaluate(() => window.beforeReset.socket.send(JSON.stringify({ requestId: 'reset-revoked', expectedToken: window.beforeReset.state.token, action: { type: 'rename', id: 'unknown', expected: '', value: 'Denied' } })));
  await owner.waitForFunction(() => window.beforeReset.messages.some(message => message.requestId === 'reset-revoked' && message.type === 'rejected'));
  assert.equal((await login(guest, 'alice', testPassword)).ok(), false);

  // A restart must preserve the reset, not restore the original password or flag.
  await host.stop();await host.start();
  assert.equal((await login(owner, 'alice', temporary)).status(), 200);assert.equal((await session(owner)).mustChangePassword, true);
  assert.equal((await session(owner)).isAdmin, false);
  await owner.goto(url + rocketPath);await owner.getByRole('heading', { name: 'Change temporary password', exact: true }).waitFor();
  assert.equal(await owner.getByRole('link', { name: 'Account settings', exact: true }).count(), 0);
  assert.equal((await api(owner, '/api/rockets', { name: 'Forbidden creation' })).status(), 403);
  assert.equal((await api(owner, '/api/rockets' + publicPath + 'rename', { rocketId: rocket.id, expectedName: rocket.name, name: 'Forbidden' })).status(), 403);
  assert.equal((await api(owner, '/api/rockets' + publicPath.slice(0, -1) + `?rocketId=${rocket.id}`, undefined, 'DELETE')).status(), 403);
  assert.equal((await api(owner, '/api/rockets' + publicPath + `sharing?rocketId=${rocket.id}`, undefined, 'GET')).status(), 403);
  assert.equal((await api(owner, '/api/admin/users', undefined, 'GET')).status(), 403);
  assert.equal((await api(owner, '/api/account/preferences', undefined, 'GET')).status(), 403);
  await rawSocket(owner, 'temporary', '/api/rockets' + publicPath + 'socket');
  await owner.evaluate(() => window.temporary.socket.send(JSON.stringify({ requestId: 'temporary-denied', expectedToken: window.temporary.state.token, action: { type: 'rename', id: 'unknown', expected: '', value: 'Denied' } })));
  await owner.waitForFunction(() => window.temporary.messages.some(message => message.requestId === 'temporary-denied' && message.type === 'rejected'));
  assert.equal((await api(owner, '/api/account/password', { currentPassword: 'wrong', newPassword: replacement })).status(), 400);
  assert.equal((await api(owner, '/api/account/password', { currentPassword: temporary, newPassword: temporary })).status(), 400);
  assert.equal((await api(owner, '/api/account/password', { currentPassword: temporary, newPassword: 'ｔ' + temporary.slice(1) })).status(), 400);
  assert.equal((await session(owner)).mustChangePassword, true);
  assert.equal((await login(old, 'alice', temporary)).status(), 200);
  await owner.getByLabel('Current password', { exact: true }).fill(temporary);
  await owner.getByLabel('New password', { exact: true }).fill(replacement);
  await owner.getByLabel('Confirm new password', { exact: true }).fill(replacement);
  await owner.getByRole('button', { name: 'Change password', exact: true }).click();await owner.waitForURL(url + '/');
  await owner.getByRole('form', { name: 'Start from scratch', exact: true }).waitFor();
  assert.equal((await session(owner)).mustChangePassword, false);assert.equal(await session(old), null);
  assert.equal((await login(guest, 'alice', temporary)).ok(), false);
  assert.equal((await login(guest, 'alice', replacement)).status(), 200);
  await createRocket(owner, url, 'alice', 'After reset');
  await admin.reload();assert.equal(await row.getByText(/Password change required/).count(), 0);

  // An old session changing its password cannot override a concurrent admin reset.
  const concurrent = await browser.newPage();await register(concurrent, url, 'racer');const racedUser = await session(concurrent);
  const [selfChange, adminReset] = await Promise.all([
    api(concurrent, '/api/account/password', { currentPassword: testPassword, newPassword: replacement }),
    api(admin, `/api/admin/users/${racedUser.id}/password`, resetBody),
  ]);
  assert.ok([200, 400, 401, 409].includes(selfChange.status()), await selfChange.text());
  assert.ok([200, 409].includes(adminReset.status()), await adminReset.text());
  if (adminReset.ok()) {
    assert.equal(await session(concurrent), null);assert.equal((await login(concurrent, 'racer', temporary)).status(), 200);
    assert.equal((await session(concurrent)).mustChangePassword, true);
  } else {
    assert.equal(selfChange.status(), 200);assert.equal((await login(concurrent, 'racer', replacement)).status(), 200);
    assert.equal((await session(concurrent)).mustChangePassword, false);
  }
  await concurrent.close();
  await admin.screenshot({ path: resolve(import.meta.dirname, '../build/password-reset-admin.png') });
  assert.deepEqual(errors, []);
  console.log(`Password reset passed in Chromium ${browser.version()}: admin/origin validation, protected admin, modal cancel/mismatch/phone layout, old and racing session revocation, WebSocket write refusal, persistent forced change from private URLs, required different password, restored access and concurrent reset/change fencing.`);
} catch (error) { console.error(host.log);throw error; }
finally { await browser?.close();await host.close(); }
