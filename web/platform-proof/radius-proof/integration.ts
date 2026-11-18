import { env, exports } from 'cloudflare:workers';
import { applyD1Migrations, evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { importArchive, exportArchive, sha256 } from '@openrocket/ork-format';
import { tubeRadiusInput } from '../../packages/ork-format/src/radius.js';
import { bootstrapOperator } from '../src/auth';
import type { RadiusBindings, RadiusRoom } from '../src/radius-room';
import type { Command } from '@openrocket/contracts';

const bindings = env as unknown as RadiusBindings & {
  TEST_MIGRATIONS: import('@cloudflare/vitest-plugin').D1Migration[];
  RADIUS_FIXTURE_BASE64: string; RADIUS_FIXTURE_SOURCE: string;
};
const origin = 'https://proof.openrocket.test';
const password = 'a-long-radius-proof-password-only';
const fromBase64 = (text: string) => Uint8Array.from(atob(text), character => character.charCodeAt(0));
function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
async function request(project: string, action: string, cookie?: string, body?: Uint8Array | object | string, requestOrigin = origin) {
  const response = await exports.default.fetch(new Request(`${origin}/radius/${project}/${action}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: body instanceof Uint8Array || typeof body === 'string' ? body : JSON.stringify(body) }) }));
  // Drain RPC response streams before the test asks workerd to evict the object.
  return new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers });
}
function auth(path: string, body: object, cookie?: string) {
  return exports.default.fetch(new Request(`${origin}/api/auth/${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) }));
}
async function signIn(email: string) {
  const response = await auth('sign-in/email', { email, password });
  expect(response.status, await response.clone().text()).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0];
}
function command(state: any, operationId: string, value: number): Command {
  const tube = state.tubes[0];
  return { protocol: 1, modelSchema: 1, projectId: state.projectId, branchId: 'main', epoch: 1,
    operationId, observedSequence: state.sequence, edit: { type: 'setOuterRadius', componentId: tube.componentId, value },
    preconditions: [ { entityId: state.projectId, field: 'archiveHash', expected: state.archiveHash },
      ...Object.entries(tube).filter(([field]) => !['schema', 'componentId'].includes(field)).map(([field, expected]) => ({ entityId: tube.componentId, field, expected })),
      { entityId: tube.componentId, field: 'automatic', expected: false }, { entityId: tube.componentId, field: 'preset', expected: false } ],
  };
}

it('edits imported archives through authenticated Java in workerd, commits atomically and recovers exact exports', async context => {
  const started = performance.now();
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
  await bootstrapOperator(bindings, 'radius-admin@example.test', password);
  const adminCookie = await signIn('radius-admin@example.test');
  const create = async (email: string) => {
    const response = await auth('admin/create-user', { email, password, name: email, role: 'user' }, adminCookie);
    expect(response.status, await response.clone().text()).toBe(200);
    return (await response.json() as any).user.id as string;
  };
  const ownerId = await create('radius-owner@example.test'), otherId = await create('radius-other@example.test');
  const ownerCookie = await signIn('radius-owner@example.test'), otherCookie = await signIn('radius-other@example.test');
  for (const [project, owner] of [['radius-a', ownerId], ['radius-b', otherId]]) {
    await bindings.RADIUS_ROOMS.getByName(project).initialize(project, owner);
    await bindings.ROOMS.getByName(project).initialize(project, owner);
  }
  const bytes = fromBase64(bindings.RADIUS_FIXTURE_BASE64);
  const original = await importArchive(bytes), originalHash = await sha256(bytes);
  for (const [project, cookie] of [['radius-a', ownerCookie], ['radius-b', otherCookie]]) {
    const response = await request(project, 'import', cookie, bytes);
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toMatchObject({ sequence: 0, archiveHash: originalHash });
  }
  const readState = async (project = 'radius-a', cookie = ownerCookie) => {
    const response = await request(project, 'state', cookie);
    expect(response.status, await response.clone().text()).toBe(200);
    return await response.json() as any;
  };
  const state = await readState();
  expect(state.importedResults).toBe('unverified-import');
  expect(state.tubes.length).toBeGreaterThan(0);
  const unchanged = await request('radius-a', 'export', ownerCookie);
  expect(new Uint8Array(await unchanged.arrayBuffer())).toEqual(bytes);
  const normalCommand = command(state, 'radius-normal', 0.03);
  let rejected = 0;
  for (const [cookie, expectedStatus] of [[undefined, 401], [otherCookie, 403], [adminCookie, 403]] as const) {
    for (const action of ['state', 'export', 'commands']) {
      expect((await request('radius-a', action, cookie, action === 'commands' ? normalCommand : undefined)).status).toBe(expectedStatus);
      rejected++;
    }
  }
  expect((await request('radius-a', 'commands', ownerCookie, normalCommand, 'https://attacker.test')).status).toBe(403); rejected++;
  for (const body of [null, { ...normalCommand, protocol: 2 }, { ...normalCommand, projectId: 'radius-b' },
    { ...normalCommand, epoch: 2 }, { ...normalCommand, observedSequence: 1 },
    { ...normalCommand, preconditions: normalCommand.preconditions.filter(p => p.field !== 'thickness') },
    { ...normalCommand, preconditions: normalCommand.preconditions.map(p => p.field === 'archiveHash' ? { ...p, expected: '0'.repeat(64) } : p) },
    { ...normalCommand, edit: { ...normalCommand.edit, value: null } },
    { ...normalCommand, edit: { ...normalCommand.edit, value: -1 } },
    { ...normalCommand, edit: { type: 'replaceXml', componentId: state.tubes[0].componentId, value: '<rocket/>' } },
    { ...normalCommand, effects: { thickness: 0 } }]) {
    expect((await request('radius-a', 'commands', ownerCookie, JSON.stringify(body))).status).toBeGreaterThanOrEqual(400); rejected++;
  }
  expect((await request('radius-a', 'commands', ownerCookie, 'x'.repeat(8193))).status).toBe(422); rejected++;
  expect((await readState()).archiveHash).toBe(originalHash);
  const editStarted = performance.now();
  const response = await request('radius-a', 'commands', ownerCookie, { ...normalCommand, authorId: otherId });
  expect(response.status, await response.clone().text()).toBe(200);
  const normal = await response.json() as any, normalWallMs = performance.now() - editStarted;
  expect(normal).toMatchObject({ authorId: ownerId, sequence: 1, duplicate: false, intrinsic: { after: { radius: 0.03, thickness: state.tubes[0].thickness, automatic: false, preset: false } } });
  const tube = state.tubes[0];
  const annulusMass = tube.density * Math.PI * (0.03 ** 2 - (0.03 - tube.thickness) ** 2) * tube.length;
  expect(Math.abs(normal.intrinsic.after.mass - annulusMass)).toBeLessThan(1e-12);
  expect(normal.intrinsic.after.cg).toBe(tube.length / 2);
  const exportNormal = new Uint8Array(await (await request('radius-a', 'export', ownerCookie)).arrayBuffer());
  expect(await sha256(exportNormal)).toBe(normal.archiveHash);
  expect(new Uint8Array(await (await bindings.FILES.get(normal.blobKey))!.arrayBuffer())).toEqual(exportNormal);
  const otherBefore = await readState('radius-b', otherCookie);
  expect(otherBefore.archiveHash).toBe(originalHash);
  expect(otherBefore.tubes[0]).toEqual(state.tubes[0]);

  const stub = bindings.RADIUS_ROOMS.getByName('radius-a');
  await runInDurableObject(stub, (_room: RadiusRoom, ctx) => {
    const stored = ctx.storage.sql.exec('SELECT sequence,hash,archive,sidecar FROM radius_workspace').one();
    expect(stored.sequence).toBe(1); expect(stored.hash).toBe(normal.archiveHash);
    expect(new Uint8Array(stored.archive as ArrayBuffer)).toEqual(exportNormal);
    expect(JSON.parse(stored.sidecar as string).archiveHash).toBe(normal.archiveHash);
    expect(ctx.storage.sql.exec('SELECT COUNT(*) AS count FROM radius_operations').one().count).toBe(1);
  });
  await evictDurableObject(stub);
  const recovered = await readState();
  expect(recovered.instance).not.toBe(state.instance);
  expect(recovered).toMatchObject({ sequence: 1, archiveHash: normal.archiveHash, importedResults: 'stale-after-edit' });
  expect(recovered.identity.simulations).toEqual(state.identity.simulations);
  expect(await (await request('radius-a', 'commands', ownerCookie, normalCommand)).json()).toEqual({ ...normal, duplicate: true });
  expect((await request('radius-a', 'commands', ownerCookie, { ...normalCommand, edit: { ...normalCommand.edit, value: 0.04 } })).status).toBe(409); rejected++;
  expect((await request('radius-a', 'commands', ownerCookie, { ...normalCommand, operationId: 'stale' })).status).toBe(409); rejected++;
  const shrinkCommand = command(recovered, 'radius-shrink', 0.0005);
  const shrinkResponse = await request('radius-a', 'commands', ownerCookie, shrinkCommand);
  expect(shrinkResponse.status, await shrinkResponse.clone().text()).toBe(200);
  const shrink = await shrinkResponse.json() as any;
  expect(shrink).toMatchObject({ sequence: 2, intrinsic: { after: { radius: 0.0005, thickness: 0.0005 } } });
  const exportShrink = new Uint8Array(await (await request('radius-a', 'export', ownerCookie)).arrayBuffer());
  const parsedShrink = await importArchive(exportShrink, (await readState()).identity);
  expect(tubeRadiusInput(parsedShrink, state.tubes[0].componentId)).toMatchObject({ radius: 0.0005, thickness: 0.0005 });
  expect(await sha256((await exportArchive(parsedShrink)).bytes)).toBe(shrink.archiveHash);
  for (const entry of original.entries.filter((e: { path: string }) => e.path !== 'rocket.ork')) {
    expect(parsedShrink.entries.find((e: { path: string }) => e.path === entry.path)?.sha256).toBe(entry.sha256);
  }
  expect(parsedShrink.parsed.components.map(n => n.id)).toEqual(original.parsed.components.map(n => n.id));
  // Mask only the intended numeric fields and simulation opening statuses, then
  // compare the complete lexical document, including unknown settings/expressions.
  const maskedXml = (archive: typeof original) => {
    const target = archive.parsed.components.find(n => n.id === tube.componentId)!;
    const spans = target.children.filter(n => ['radius', 'thickness'].includes(n.name))
      .map(n => ({ start: n.contentStart, end: n.contentEnd, text: '<radius-proof-field>' }));
    for (const node of archive.parsed.simulations) {
      spans.push({ start: node.start, end: node.contentStart,
        text: archive.xml.slice(node.start, node.contentStart).replace(/status="[a-z]+"/, 'status="<radius-proof-status>"') });
    }
    let xml = archive.xml;
    for (const span of spans.sort((a, b) => b.start - a.start)) xml = xml.slice(0, span.start) + span.text + xml.slice(span.end);
    return xml;
  };
  expect(maskedXml(parsedShrink)).toBe(maskedXml(original));
  const originalStatuses = original.parsed.simulations.map(n => n.attributes.status?.value);
  const changedStatuses = parsedShrink.parsed.simulations.map(n => n.attributes.status?.value);
  expect(changedStatuses).toEqual(originalStatuses.map(status => ['uptodate', 'loaded'].includes(status ?? '') ? 'outdated' : status));
  const series = (archive: any) => archive.parsed.nodes.filter((n: { name: string }) => n.name === 'flightdata').map((n: any) => archive.xml.slice(n.start, n.end));
  expect(series(parsedShrink)).toEqual(series(original));
  // A reverse edit and two competing requests exercise request-local Java state
  // and the revision recheck after asynchronous archive/R2 work.
  const reverse = await request('radius-b', 'commands', otherCookie, command(otherBefore, 'other-edit', 0.04));
  expect(reverse.status, await reverse.clone().text()).toBe(200);
  expect((await readState()).archiveHash).toBe(shrink.archiveHash);
  const competingSource = await readState('radius-b', otherCookie);
  const concurrent = await Promise.all([
    request('radius-b', 'commands', otherCookie, command(competingSource, 'race-one', 0.041)),
    request('radius-b', 'commands', otherCookie, command(competingSource, 'race-two', 0.042)),
  ]);
  expect(concurrent.map(r => r.status).sort()).toEqual([200, 409]);
  rejected++;
  expect((await readState('radius-b', otherCookie)).sequence).toBe(2);
  expect((await readState()).archiveHash).toBe(shrink.archiveHash);
  // Hold both commands after their initial duplicate lookup. This exercises the
  // publication race deterministically without adding a production test hook.
  const otherStub = bindings.RADIUS_ROOMS.getByName('radius-b');
  await runInDurableObject(otherStub, (room: RadiusRoom) => {
    const instance = room as any;
    const storeBlob = instance.storeBlob.bind(instance);
    let arrivals = 0, release: () => void;
    const bothArrived = new Promise<void>(resolve => { release = resolve; });
    instance.storeBlob = async (...args: unknown[]) => {
      const key = await storeBlob(...args);
      if (++arrivals === 2) release();
      await bothArrived;
      return key;
    };
  });
  const retrySource = await readState('radius-b', otherCookie);
  const sameCommand = command(retrySource, 'simultaneous-retry', 0.043);
  const simultaneous = await Promise.all([
    request('radius-b', 'commands', otherCookie, sameCommand),
    request('radius-b', 'commands', otherCookie, sameCommand),
  ]);
  expect(simultaneous.map(r => r.status)).toEqual([200, 200]);
  const retries = await Promise.all(simultaneous.map(r => r.json())) as any[];
  expect(retries.map(r => r.duplicate).sort()).toEqual([false, true]);
  expect({ ...retries[0], duplicate: true }).toEqual({ ...retries[1], duplicate: true });
  await runInDurableObject(otherStub, (room: RadiusRoom) => {
    (room as any).storeBlob = Object.getPrototypeOf(room).storeBlob;
  });
  expect((await readState('radius-b', otherCookie)).sequence).toBe(3);
  expect((await readState()).archiveHash).toBe(shrink.archiveHash);
  const logout = await auth('sign-out', {}, ownerCookie); expect(logout.status).toBe(200);
  expect((await request('radius-a', 'export', ownerCookie)).status).toBe(401); rejected++;
  const report = { schema: 1, runtime: 'Vitest Cloudflare plugin/workerd', fixture: bindings.RADIUS_FIXTURE_SOURCE, originalHash,
    compressedBytes: bytes.length, components: original.parsed.components.length, simulations: original.parsed.simulations.length,
    entries: original.entries.map((e: { path: string; sha256: string; bytes: Uint8Array }) => ({ path: e.path, sha256: e.sha256, bytes: e.bytes.length })),
    totalWallMs: performance.now() - started, normalWallMs, normal, shrink, rejectedRequests: rejected,
    authenticatedProjects: 2, reconstruction: true, exactRetry: true, concurrentIdenticalRetry: true, concurrentRevisionConflict: true, storedFlightDataPreserved: true,
    exports: [{ name: 'normal.ork', base64: toBase64(exportNormal) }, { name: 'shrink.ork', base64: toBase64(exportShrink) }] };
  await context.annotate(JSON.stringify(report), 'radius-proof-artifacts');
});
