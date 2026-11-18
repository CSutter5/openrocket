import { env } from 'cloudflare:workers';
import { applyD1Migrations, createExecutionContext } from 'cloudflare:test';
import { expect, it } from 'vitest';
import remote from '../src/remote-smoke';
import type { Bindings } from '../src/index';

it('gates the remote-only one-time harness and exercises setup in local workerd', async () => {
  const bindings = env as unknown as Bindings & { TEST_MIGRATIONS: import('@cloudflare/vitest-plugin').D1Migration[] };
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
  await bindings.DB.exec('CREATE TABLE proof_remote_setup (id INTEGER PRIMARY KEY CHECK (id = 1))');
  const remoteBindings = { ...bindings, PROOF_OPERATOR_SECRET: 'test-only-operator-secret-never-use-remotely' };
  const ready = await remote.fetch(new Request('https://proof.openrocket.test/__g1/ready', { headers: { Authorization: 'Bearer ' + remoteBindings.PROOF_OPERATOR_SECRET } }), remoteBindings, createExecutionContext());
  expect(ready.status).toBe(200);
  const body = { adminEmail: 'remote-admin@example.test', ownerEmail: 'remote-owner@example.test', otherEmail: 'remote-other@example.test', password: 'test-only-remote-fixture-password' };
  const setup = (token: string) => remote.fetch(new Request('https://proof.openrocket.test/__g1/setup', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: JSON.stringify(body) }), remoteBindings, createExecutionContext());
  expect((await setup('invalid')).status).toBe(403);
  expect(await bindings.DB.prepare('SELECT id FROM proof_remote_setup').first()).toBeNull();
  const response = await setup(remoteBindings.PROOF_OPERATOR_SECRET);
  expect(response.status).toBe(200);
  const ids = await response.json() as { ownerId: string };
  expect(await bindings.ROOMS.getByName('g1-project-a').authorize(ids.ownerId)).toBe(true);
  expect(await (await bindings.FILES.get('g1-project-a/design.ork'))!.text()).toBe('g1 private runtime fixture');
  expect((await setup(remoteBindings.PROOF_OPERATOR_SECRET)).status).toBe(409);
});
