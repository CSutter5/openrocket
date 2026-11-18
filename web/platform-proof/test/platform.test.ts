import { env, exports } from 'cloudflare:workers';
import { applyD1Migrations, evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';
import { simulationInputHash, resultIsCurrent, DESKTOP_REVISION, type SimulationInput, type CompletedResult } from '@openrocket/contracts';
import { bootstrapOperator } from '../src/auth';
import type { Bindings, ProofRoom } from '../src/index';

const bindings = env as unknown as Bindings & { TEST_MIGRATIONS: import('@cloudflare/vitest-plugin').D1Migration[] };
const origin = 'https://proof.openrocket.test';
const password = 'a-long-local-test-password-only';
const metrics: Record<string, number> = {};
let adminCookie: string, ownerCookie: string, strangerCookie: string;
let adminId: string, ownerId: string, strangerId: string;

async function request(path: string, body?: object, cookie?: string, requestOrigin = origin) {
  return exports.default.fetch(new Request(origin + path, {
    method: body ? 'POST' : 'GET',
    headers: { Origin: requestOrigin, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
}
async function signIn(email: string) {
  const start = performance.now();
  const response = await request('/api/auth/sign-in/email', { email, password });
  metrics[`login-${email}`] = performance.now() - start;
  expect(response.status, await response.clone().text()).toBe(200);
  const cookie = response.headers.get('set-cookie')!;
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('Secure');
  expect(cookie).toContain('SameSite=Lax');
  return cookie.split(';')[0];
}
async function createUser(email: string) {
  const response = await request('/api/auth/admin/create-user', { email, password, name: email, role: 'user' }, adminCookie);
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json() as any).user.id as string;
}
function receive(socket: WebSocket): Promise<any> {
  return new Promise((resolve, reject) => {
    socket.addEventListener('message', event => resolve(JSON.parse(String(event.data))), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}
function command(operationId: string, observedSequence = 0, projectId = 'project-a') {
  return { protocol: 1, modelSchema: 1, projectId, branchId: 'main', epoch: 1, operationId, observedSequence, operation: 'increment' };
}
async function connect(project = 'project-a', cookie = ownerCookie) {
  const response = await exports.default.fetch(new Request(`${origin}/projects/${project}/ws`, { headers: { Upgrade: 'websocket', Origin: origin, Cookie: cookie } }));
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  socket.accept();
  return { socket, hello: await receive(socket) };
}
beforeAll(async () => {
  const start = performance.now();
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
  metrics.migrate = performance.now() - start;
  const bootstrapStart = performance.now();
  adminId = (await bootstrapOperator(bindings, 'admin@example.test', password)).id;
  metrics.bootstrapHash = performance.now() - bootstrapStart;
  await expect(bootstrapOperator(bindings, 'other-admin@example.test', password)).rejects.toThrow('already bootstrapped');
  adminCookie = await signIn('admin@example.test');
  ownerId = await createUser('owner@example.test');
  strangerId = await createUser('stranger@example.test');
  ownerCookie = await signIn('owner@example.test');
  strangerCookie = await signIn('stranger@example.test');
  await bindings.ROOMS.getByName('project-a').initialize('project-a', ownerId);
  await bindings.ROOMS.getByName('project-b').initialize('project-b', strangerId);
});

it('serves actual static assets and Hono through Workers, with applied D1 migrations', async () => {
  expect(await (await request('/health')).json()).toMatchObject({ runtime: 'workers', protocol: 1 });
  expect(await (await request('/index.html')).text()).toContain('OpenRocket G1 runtime proof');
  const migration = await bindings.DB.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first<{ count: number }>();
  expect(migration?.count).toBe(1);
  const row = await bindings.DB.prepare('SELECT password FROM account WHERE user_id=?').bind(ownerId).first<{password: string}>();
  expect(row!.password).not.toBe(password);
  expect(row!.password.length).toBeGreaterThan(64);
});

it('rejects public signup, wrong passwords, hostile origins, unauthenticated admin and privilege escalation', async () => {
  expect((await request('/api/auth/sign-up/email', { name: 'forged', email: 'forged@example.test', password, role: 'admin' })).status).toBeGreaterThanOrEqual(400);
  expect((await request('/api/auth/sign-in/email', { email: 'owner@example.test', password: 'incorrect-password' })).status).toBe(401);
  expect((await request('/api/auth/sign-in/email', { email: 'owner@example.test', password }, undefined, 'https://attacker.test')).status).toBe(403);
  expect((await request('/api/auth/admin/set-role', { userId: ownerId, role: 'admin' }, ownerCookie)).status).toBe(403);
  expect((await request('/api/auth/admin/set-role', { userId: ownerId, role: 'admin' })).status).toBeGreaterThanOrEqual(400);
  expect((await request('/api/auth/admin/impersonate-user', { userId: ownerId }, adminCookie)).status).toBe(403);
  const role = await bindings.DB.prepare('SELECT role FROM user WHERE id=?').bind(ownerId).first<{role: string}>();
  expect(role?.role).toBe('user');
});

it('enforces private R2 membership across known project/file IDs, including global admin', async () => {
  await bindings.FILES.put('project-a/design.ork', 'private expanded archive blob');
  const downloaded = await request('/projects/project-a/files/design.ork', undefined, ownerCookie);
  expect(new TextDecoder().decode(await downloaded.arrayBuffer())).toBe('private expanded archive blob');
  expect((await request('/projects/project-a/files/design.ork')).status).toBe(401);
  expect((await request('/projects/project-a/files/design.ork', undefined, strangerCookie)).status).toBe(403);
  expect((await request('/projects/project-a/files/design.ork', undefined, adminCookie)).status).toBe(403);
  expect((await request('/projects/project-b/files/design.ork', undefined, ownerCookie)).status).toBe(403);
});

it('hibernates live sockets, reconstructs SQLite state, deduplicates acknowledgments and isolates projects', async () => {
  const { socket, hello } = await connect();
  expect(hello.sequence).toBe(0);
  let next = receive(socket); socket.send(JSON.stringify({ ...command('op-1'), authorId: strangerId }));
  const accepted = await next;
  expect(accepted).toMatchObject({ sequence: 1, authorId: ownerId, duplicate: false });
  const stub = bindings.ROOMS.getByName('project-a');
  await runInDurableObject(stub, async (_instance: ProofRoom, ctx) => {
    expect(ctx.storage.sql.exec('SELECT sequence FROM room').one().sequence).toBe(1);
    expect(ctx.getWebSockets()[0].deserializeAttachment()).toMatchObject({ userId: ownerId, projectId: 'project-a' });
  });
  await evictDurableObject(stub);
  next = receive(socket); socket.send(JSON.stringify(command('op-1')));
  const duplicate = await next;
  expect(duplicate).toMatchObject({ sequence: 1, duplicate: true, authorId: ownerId });
  expect(duplicate.instance).not.toBe(hello.instance);
  next = receive(socket); socket.send(JSON.stringify(command('op-2', 1)));
  expect(await next).toMatchObject({ sequence: 2 });
  next = receive(socket); socket.send(JSON.stringify(command('cross-project', 2, 'project-b')));
  expect(await next).toMatchObject({ error: { code: 'invalid' } });
  const reconnected = await connect();
  expect(reconnected.hello.sequence).toBe(2);
  const other = await connect('project-b', strangerCookie);
  expect(other.hello.sequence).toBe(0);
  socket.close(); reconnected.socket.close(); other.socket.close();
});

it('rejects WebSocket origin spoofing and non-members', async () => {
  const denied = await exports.default.fetch(new Request(`${origin}/projects/project-a/ws`, { headers: { Upgrade: 'websocket', Origin: 'https://attacker.test', Cookie: ownerCookie } }));
  expect(denied.status).toBe(403);
  const deniedMember = await exports.default.fetch(new Request(`${origin}/projects/project-a/ws`, { headers: { Upgrade: 'websocket', Origin: origin, Cookie: strangerCookie } }));
  expect(deniedMember.status).toBe(403);
  const unknown = await exports.default.fetch(new Request(`${origin}/projects/unknown-project/ws`, { headers: { Upgrade: 'websocket', Origin: origin, Cookie: ownerCookie } }));
  expect(unknown.status).toBe(403);
});

it('rejects malformed, wrongly typed and oversized socket commands', async () => {
  const { socket } = await connect();
  let next = receive(socket); socket.send('null');
  expect(await next).toMatchObject({ error: { code: 'invalid' } });
  next = receive(socket); socket.send(JSON.stringify({ ...command('typed', 2), operationId: 123 }));
  expect(await next).toMatchObject({ error: { code: 'invalid' } });
  next = receive(socket); socket.send(JSON.stringify({ ...command('protocol', 2), protocol: 2 }));
  expect(await next).toMatchObject({ error: { code: 'version' } });
  const closed = new Promise<number>(resolve => socket.addEventListener('close', (event: CloseEvent) => resolve(event.code), { once: true }));
  socket.send('x'.repeat(2049));
  expect(await closed).toBe(1009);
});

it('supports concurrent admin operations, ban/session revocation, recovery password and expiry', async (context) => {
  const created = await createUser('recover@example.test');
  const cookie = await signIn('recover@example.test');
  const results = await Promise.all([
    request('/api/auth/admin/set-role', { userId: created, role: 'admin' }, adminCookie),
    request('/api/auth/admin/set-user-password', { userId: created, newPassword: 'operator-recovery-password-only' }, adminCookie),
  ]);
  expect(results.map(r => r.status)).toEqual([200, 200]);
  const changedRole = await bindings.DB.prepare('SELECT role FROM user WHERE id=?').bind(created).first<{role: string}>();
  expect(changedRole?.role).toBe('admin');
  expect((await request('/api/auth/admin/set-role', { userId: created, role: 'user' }, adminCookie)).status).toBe(200);
  const listed = await request('/api/auth/admin/list-users', undefined, adminCookie);
  expect(listed.status).toBe(200);
  expect((await request('/api/auth/sign-in/email', { email: 'recover@example.test', password })).status).toBe(401);
  const recoveryLogin = await request('/api/auth/sign-in/email', { email: 'recover@example.test', password: 'operator-recovery-password-only' });
  expect(recoveryLogin.status).toBe(200);
  const recoveredCookie = recoveryLogin.headers.get('set-cookie')!.split(';')[0];
  const ban = await request('/api/auth/admin/ban-user', { userId: created, banReason: 'proof suspension' }, adminCookie);
  expect(ban.status, await ban.clone().text()).toBe(200);
  expect(await (await request('/api/auth/get-session', undefined, recoveredCookie)).json()).toBeNull();
  expect(await (await request('/api/auth/get-session', undefined, cookie)).json()).toBeNull();
  expect((await request('/api/auth/sign-in/email', { email: 'recover@example.test', password: 'operator-recovery-password-only' })).status).toBe(403);
  await request('/api/auth/admin/unban-user', { userId: created }, adminCookie);
  const expiredCookie = await signIn('stranger@example.test');
  await bindings.DB.prepare('UPDATE session SET expires_at=0 WHERE user_id=?').bind(strangerId).run();
  expect(await (await request('/api/auth/get-session', undefined, expiredCookie)).json()).toBeNull();
  await context.annotate(JSON.stringify(metrics), 'local-workerd-wall-ms');
});

it('rechecks revoked sessions on existing sockets and logs out without cached authority', async () => {
  const { socket } = await connect();
  const logout = await request('/api/auth/sign-out', {}, ownerCookie);
  expect(logout.status).toBe(200);
  expect(await (await request('/api/auth/get-session', undefined, ownerCookie)).json()).toBeNull();
  const closed = new Promise<number>(resolve => socket.addEventListener('close', (e: CloseEvent) => resolve(e.code), { once: true }));
  socket.send(JSON.stringify(command('revoked', 2)));
  expect(await closed).toBe(1008);
});


it('binds shared browser results to exact inputs using Workers Web Crypto', async () => {
  const input: SimulationInput = { schema: 1, desktopRevision: DESKTOP_REVISION, engineHash: '1'.repeat(64), motorCatalogHash: '2'.repeat(64), materialCatalogHash: '3'.repeat(64), archiveTreeHash: '4'.repeat(64), identitySidecarHash: '5'.repeat(64), simulationId: 'simulation-a', configurationId: 'configuration-a', optionsHash: '6'.repeat(64), extensionSetHash: '7'.repeat(64), seed: 42, integrator: 'RK6' as const };
  const inputHash = await simulationInputHash(input);
  const result: CompletedResult = { schema: 1, status: 'completed', source: 'browser-client', inputHash, outputHash: 'a'.repeat(64), authorId: ownerId, projectId: 'project-a', branchId: 'main', epoch: 1 };
  expect(await resultIsCurrent(result, input)).toBe(true);
  for (const update of [{ archiveTreeHash: '8'.repeat(64) }, { seed: 43 }, { integrator: 'RK4' }, { optionsHash: '9'.repeat(64) }]) {
    expect(await resultIsCurrent(result, { ...input, ...update } as typeof input)).toBe(false);
  }
});


it('closes live sockets after suspension or project membership removal', async () => {
  const suspendedId = await createUser('suspended@example.test');
  const suspendedCookie = await signIn('suspended@example.test');
  await bindings.ROOMS.getByName('suspended-project').initialize('suspended-project', suspendedId);
  const suspended = await connect('suspended-project', suspendedCookie);
  expect((await request('/api/auth/admin/ban-user', { userId: suspendedId, banReason: 'live socket suspension' }, adminCookie)).status).toBe(200);
  const closedSuspension = new Promise<number>(resolve => suspended.socket.addEventListener('close', (e: CloseEvent) => resolve(e.code), { once: true }));
  suspended.socket.send(JSON.stringify(command('suspended-op', 0, 'suspended-project')));
  expect(await closedSuspension).toBe(1008);

  const memberId = await createUser('removed@example.test');
  const memberCookie = await signIn('removed@example.test');
  const stub = bindings.ROOMS.getByName('removed-project');
  await stub.initialize('removed-project', memberId);
  const removed = await connect('removed-project', memberCookie);
  await runInDurableObject(stub, (_instance, ctx) => {
    ctx.storage.sql.exec('UPDATE room SET owner=? WHERE id=1', adminId);
  });
  const closedMembership = new Promise<number>(resolve => removed.socket.addEventListener('close', (e: CloseEvent) => resolve(e.code), { once: true }));
  removed.socket.send(JSON.stringify(command('removed-op', 0, 'removed-project')));
  expect(await closedMembership).toBe(1008);
  await runInDurableObject(stub, (_instance, ctx) => {
    expect(ctx.storage.sql.exec('SELECT sequence FROM room').one().sequence).toBe(0);
  });
});
