import { env, exports } from 'cloudflare:workers';
import { applyD1Migrations, evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { importArchive, sha256 } from '@openrocket/ork-format';
import { digestVector } from '../../engine-adapter/build/generated/teavm/js/reducer.js';
import { bootstrapOperator } from '../src/auth';
import type { RadiusBindings, RadiusRoom } from '../src/radius-room';
import type { Command } from '@openrocket/contracts';

const bindings = env as unknown as RadiusBindings & {
  TEST_MIGRATIONS: import('@cloudflare/vitest-plugin').D1Migration[];
  EFFECTS_AUTOMATIC_RING: boolean; EFFECTS_FIXTURES: string[]; EFFECTS_DIGESTS: { length: number; digest: string }[];
};
const automaticRing = bindings.EFFECTS_AUTOMATIC_RING;
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
function command(state: any, operationId: string, edit: any): Command {
  const projection = edit.type === 'setOuterRadius' ? state.tubes.find((t: any) => t.componentId === edit.componentId)
    : state.recovery.find((r: any) => r.componentId === edit.componentId);
  return { protocol: 1, modelSchema: 1, projectId: state.projectId, branchId: 'main', epoch: 1, operationId,
    observedSequence: state.sequence, edit, preconditions: [
      { entityId: state.projectId, field: 'archiveHash', expected: state.archiveHash },
      ...Object.entries(projection).filter(([field]) => !['schema', 'componentId'].includes(field)).map(([field, expected]) => ({ entityId: edit.componentId, field, expected })),
      ...(edit.type === 'setOuterRadius' ? [{ entityId: edit.componentId, field: 'automatic', expected: false },
        ...('preset' in projection ? [] : [{ entityId: edit.componentId, field: 'preset', expected: false }])] : []),
    ] };
}

it('proves preset clearing and configuration-dependent reset through the authenticated durable archive pipeline', async context => {
  const started = performance.now();
  expect(bindings.EFFECTS_DIGESTS.length).toBe(136);
  for (const vector of bindings.EFFECTS_DIGESTS) expect(digestVector(vector.length)).toBe(vector.digest);
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
  await bootstrapOperator(bindings, 'effects-admin@example.test', password);
  const adminCookie = await signIn('effects-admin@example.test');
  const users: { id: string; cookie: string }[] = [];
  for (const email of ['effects-a@example.test', 'effects-b@example.test']) {
    const response = await auth('admin/create-user', { email, password, name: email, role: 'user' }, adminCookie);
    expect(response.status).toBe(200);
    users.push({ id: (await response.json() as any).user.id, cookie: await signIn(email) });
  }
  const projects = ['effects-a', 'effects-b'];
  const originals = await Promise.all(bindings.EFFECTS_FIXTURES.map(s => importArchive(fromBase64(s))));
  const state = async (i = 0) => {
    const response = await request(projects[i], 'state', users[i].cookie);
    expect(response.status, await response.clone().text()).toBe(200);
    return await response.json() as any;
  };
  const archiveBytes = async (i = 0) => new Uint8Array(await (await request(projects[i], 'export', users[i].cookie)).arrayBuffer());
  for (let i = 0; i < 2; i++) {
    await bindings.RADIUS_ROOMS.getByName(projects[i]).initialize(projects[i], users[i].id);
    const bytes = fromBase64(bindings.EFFECTS_FIXTURES[i]);
    expect((await request(projects[i], 'import', users[i].cookie, bytes)).status).toBe(200);
    expect(await archiveBytes(i)).toEqual(bytes);
  }
  const initial = [await state(0), await state(1)];
  expect(initial[0].tubes[0].preset.digest).not.toBe(initial[1].tubes[0].preset.digest);
  expect(initial[0].recovery[0].default.altitude).not.toBe(initial[1].recovery[0].default.altitude);
  if (automaticRing) {
    expect(initial[0].tubes[0].ring.density).not.toBe(initial[1].tubes[0].ring.density);
    expect(initial[0].tubes[0].ring.innerRadius).not.toBe(initial[1].tubes[0].ring.innerRadius);
  }
  const exports: { name: string; base64: string }[] = [], cases: any[] = [], timings: any[] = [];
  const source = ['G1-A.ork', 'G1-B.ork'];
  let rejectedRequests = 0;
  async function accepted(i: number, name: string, edit: any) {
    const before = await state(i), other = await state(1 - i);
    const body = command(before, name, edit), start = performance.now();
    const response = await request(projects[i], 'commands', users[i].cookie, { ...body, authorId: users[1 - i].id });
    expect(response.status, await response.clone().text()).toBe(200);
    const ack = await response.json() as any;
    timings.push({ name, localRequestWallMs: performance.now() - start });
    expect(ack.authorId).toBe(users[i].id); expect(ack.sequence).toBe(before.sequence + 1);
    if (edit.type === 'resetDeploymentConfiguration') {
      const changed = ack.intrinsic.functionalChange;
      expect(ack.intrinsic.rocketChanged).toEqual({ document: changed, mass: false, aerodynamic: changed, tree: false, functional: changed });
    }
    if (edit.type === 'setOuterRadius') {
      const tube = before.tubes.find((t: any) => t.componentId === edit.componentId), after = ack.intrinsic.after;
      const inner = tube.filled ? 0 : Math.max(0, after.radius - after.thickness);
      const expectedMass = tube.density * Math.PI * (after.radius ** 2 - inner ** 2) * tube.length;
      expect(Math.abs(after.mass - expectedMass)).toBeLessThan(1e-12);
      expect(after.cg).toBe(tube.length / 2);
      if (automaticRing) {
        const r = tube.ring, actual = after.ring;
        expect(actual.outerRadius).toBe(inner);
        expect(actual.innerRadius).toBe(r.innerRadius);
        expect(actual.outerAutomatic).toBe(true); expect(actual.innerAutomatic).toBe(false);
        const ringMass = Math.PI * Math.max(inner ** 2 - r.innerRadius ** 2, 0) * r.length * r.density;
        expect(Math.abs(actual.mass - ringMass)).toBeLessThan(1e-12);
        expect(actual.cg).toBe(r.length / 2); expect(actual.cgMass).toBe(actual.mass);
        expect(actual.bounds).toEqual([0, r.length, -inner, inner, -inner, inner]);
        expect(actual.positionX).toBe(r.axialOffset);
        expect(actual.thickness).toBe(Math.max(inner - r.innerRadius, 0));
        expect(Math.abs(actual.longitudinalUnitInertia - (3 * (inner ** 2 + r.innerRadius ** 2) + r.length ** 2) / 12)).toBeLessThan(1e-12);
        expect(Math.abs(actual.rotationalUnitInertia - (inner ** 2 + r.innerRadius ** 2) / 2)).toBeLessThan(1e-12);
        const changed = after.radius !== tube.radius;
        expect(ack.intrinsic.configurationChanged).toEqual(tube.configurationIds.map(() => changed));
        expect(ack.intrinsic.rocketChanged).toEqual({ document: changed, mass: changed, aerodynamic: changed, tree: false, functional: changed });
        expect(ack.effects.find((e: any) => e.entityId === r.componentId && e.field === 'derivedGeometry').after).toEqual(actual);
      }
    }
    const bytes = await archiveBytes(i), after = await state(i), archive = await importArchive(bytes, after.identity);
    expect(await sha256(bytes)).toBe(ack.archiveHash);
    expect(new Uint8Array(await (await bindings.FILES.get(ack.blobKey))!.arrayBuffer())).toEqual(bytes);
    expect(after.identity.simulations).toEqual(initial[i].identity.simulations);
    expect((await state(1 - i)).archiveHash).toBe(other.archiveHash);
    const filename = `${name}.ork`;
    exports.push({ name: filename, base64: toBase64(bytes) });
    cases.push({ name, source: source[i], export: filename, edit, ack }); source[i] = filename;
    for (const entry of originals[i].entries.filter(e => e.path !== 'rocket.ork')) {
      expect(archive.entries.find(e => e.path === entry.path)?.bytes).toEqual(entry.bytes);
    }
    expect(archive.parsed.components.map(n => n.id)).toEqual(originals[i].parsed.components.map(n => n.id));
    const flightdata = (a: any) => a.parsed.nodes.filter((n: any) => n.name === 'flightdata').map((n: any) => a.xml.slice(n.start, n.end));
    expect(flightdata(archive)).toEqual(flightdata(originals[i]));
    // An independently specified lexical mask covers ONLY this accepted action.
    const beforeArchive = await importArchive(fromBase64(exports.find(e => e.name === cases.at(-1).source)?.base64
      ?? bindings.EFFECTS_FIXTURES[i]), before.identity);
    const mask = (a: any) => {
      const target = a.parsed.components.find((n: any) => n.id === edit.componentId);
      const spans = target.children.filter((n: any) => edit.type === 'setOuterRadius'
        ? ['radius', 'thickness', 'preset'].includes(n.name)
        : n.name === 'deploymentconfiguration' && n.attributes.configid?.value === edit.configurationId)
        .map((n: any) => ({ start: n.start, end: n.end, text: n.name === 'preset' || edit.type !== 'setOuterRadius' ? '' : `<${n.name}>MASK</${n.name}>` }));
      for (const effect of ack.effects.filter((e: any) => e.field === 'status')) {
        const index = before.identity.simulations.findIndex((s: any) => s.id === effect.entityId), n = a.parsed.simulations[index];
        spans.push({ start: n.start, end: n.contentStart, text: a.xml.slice(n.start, n.contentStart).replace(/status="[a-z]+"/, 'status="MASK"') });
      }
      let xml = a.xml;
      for (const span of spans.sort((a: any, b: any) => b.start - a.start)) xml = xml.slice(0, span.start) + span.text + xml.slice(span.end);
      return xml;
    };
    expect(mask(archive)).toBe(mask(beforeArchive));
    expect(archive.xml).toContain("G1_IMPORTED_SCRIPT_EXECUTED");
    return { ack, body, archive, before, after };
  }
  const radius = (i: number, value: number) => ({ type: 'setOuterRadius', componentId: initial[i].tubes[0].componentId, value });
  const reset = (i: number, index: number) => ({ type: 'resetDeploymentConfiguration', componentId: initial[i].recovery[0].componentId,
    configurationId: initial[i].recovery[0].configurationIds[index] });
  const sample = command(initial[0], 'rejected', radius(0, 0.031));
  for (const [cookie, status] of [[undefined, 401], [users[1].cookie, 403], [adminCookie, 403]] as const) {
    for (const path of ['state', 'export', 'commands']) { expect((await request(projects[0], path, cookie, path === 'commands' ? sample : undefined)).status).toBe(status); rejectedRequests++; }
  }
  for (const body of [null, { ...sample, effects: {} }, { ...sample, epoch: 2 }, { ...sample, observedSequence: 1 },
    { ...sample, preconditions: sample.preconditions.filter(p => p.field !== 'preset') },
    { ...sample, preconditions: sample.preconditions.map(p => p.field === 'preset' ? { ...p, expected: { ...(p.expected as object), digest: '0'.repeat(32) } } : p) },
    command(initial[0], 'unknown-config', { ...reset(0, 0), configurationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
    { ...sample, edit: { ...radius(0, -1) } }, { ...sample, edit: { ...radius(0, 0.031), value: null } },
    { ...sample, projectId: projects[1] }, { ...sample, edit: { type: 'replaceXml', value: '<rocket/>' } }]) {
    expect((await request(projects[0], 'commands', users[0].cookie, JSON.stringify(body))).status).toBeGreaterThanOrEqual(400); rejectedRequests++;
  }
  expect((await request(projects[0], 'commands', users[0].cookie, sample, 'https://attacker.test')).status).toBe(403); rejectedRequests++;
  expect((await state()).archiveHash).toBe(initial[0].archiveHash);
  // Unsupported imported forms must fail at the public command boundary without
  // publishing a revision, even when the underlying archive is preservation-safe.
  for (const [index, [xml, edit]] of [
    [originals[0].xml.replace(initial[0].tubes[0].preset.digest, '0'.repeat(32)), radius(0, 0.031)],
    [originals[0].xml.replace('<radius>0.03</radius>', '<radius>auto 0.03</radius>'), radius(0, 0.031)],
    [originals[0].xml.replace('<deploydelay>1.5</deploydelay>', ''), reset(0, 0)],
    [originals[0].xml.replace('</deploymentconfiguration>', '<!-- preserve me --></deploymentconfiguration>'), reset(0, 0)],
  ].entries()) {
    const project = `effects-unsupported-${index}`, bytes = new TextEncoder().encode(xml as string);
    await bindings.RADIUS_ROOMS.getByName(project).initialize(project, users[0].id);
    expect((await request(project, 'import', users[0].cookie, bytes)).status).toBe(200);
    const bad = { ...sample, projectId: project, operationId: `unsupported-${index}`, edit, preconditions: [] };
    expect((await request(project, 'commands', users[0].cookie, bad)).status).toBe(422); rejectedRequests++;
    const exported = await request(project, 'export', users[0].cookie);
    expect(exported.headers.get('x-workspace-sequence')).toBe('0');
    expect(new Uint8Array(await exported.arrayBuffer())).toEqual(bytes);
  }
  if (automaticRing) {
    const ring = originals[0].parsed.components.find(n => n.id === initial[0].tubes[0].ring.componentId)!;
    const replaceField = (name: string, text: string) => {
      const n = ring.children.find(n => n.name === name)!;
      return originals[0].xml.slice(0, n.contentStart) + text + originals[0].xml.slice(n.contentEnd);
    };
    for (const [i, xml] of [replaceField('innerradius', 'auto'), replaceField('instancecount', '2'), replaceField('radialposition', '0.1'),
      replaceField('position', '0.021'), replaceField('outerradius', 'auto 0.029')].entries()) {
      const project = `ring-unsupported-${i}`, bytes = new TextEncoder().encode(xml);
      await bindings.RADIUS_ROOMS.getByName(project).initialize(project, users[0].id);
      expect((await request(project, 'import', users[0].cookie, bytes)).status).toBe(200);
      expect((await request(project, 'commands', users[0].cookie, { ...sample, projectId: project, preconditions: [] })).status).toBe(422);
      expect(new Uint8Array(await (await request(project, 'export', users[0].cookie)).arrayBuffer())).toEqual(bytes);
      rejectedRequests++;
    }
    const underfit = command(initial[0], 'ring-underfit', radius(0, 0.0005));
    const response = await request(projects[0], 'commands', users[0].cookie, underfit);
    expect(response.status, await response.clone().text()).toBe(422); rejectedRequests++;
    expect(new Uint8Array(await (await request(projects[0], 'export', users[0].cookie)).arrayBuffer())).toEqual(fromBase64(bindings.EFFECTS_FIXTURES[0]));
    for (const preconditions of [sample.preconditions.filter(p => p.field !== 'ring'), sample.preconditions.map(p => p.field === 'ring'
      ? { ...p, expected: { ...(p.expected as any), density: (p.expected as any).density + 1 } } : p)]) {
      expect((await request(projects[0], 'commands', users[0].cookie, { ...sample, preconditions })).status).toBe(409); rejectedRequests++;
    }
    expect((await state()).sequence).toBe(0);
  }
  const same = await accepted(0, 'preset-equal', radius(0, initial[0].tubes[0].radius));
  expect(same.ack.intrinsic.before.preset).toBe(true); expect(same.ack.intrinsic.after.preset).toBe(true);
  expect(same.after.archiveHash).toBe(initial[0].archiveHash);
  expect(same.after.importedResults).toBe('unverified-import');
  const bReset = await accepted(1, 'b-reset', reset(1, 0));
  expect(bReset.ack.intrinsic.functionalChange).toBe(true);
  expect(bReset.ack.intrinsic.configurationChanged).toEqual(initial[1].recovery[0].configurationIds.map((_: string, i: number) => i === 0));
  const equalReset = await accepted(0, 'reset-equal-default', reset(0, 1));
  expect(equalReset.ack.intrinsic.functionalChange).toBe(false);
  expect(equalReset.after.importedResults).toBe('unverified-import');
  expect(equalReset.after.simulationStatuses).toEqual(initial[0].simulationStatuses);
  expect(equalReset.ack.effects.filter((e: any) => e.field === 'status')).toEqual([]);
  const inherited = await accepted(0, 'reset-inherited', reset(0, 2));
  expect(inherited.after.archiveHash).toBe(inherited.before.archiveHash);
  const changedReset = await accepted(0, 'reset-changed', reset(0, 0));
  expect(changedReset.ack.intrinsic.after.effective[0].parameters).toEqual(initial[0].recovery[0].default);
  const affected = changedReset.ack.effects.filter((e: any) => e.field === 'status');
  const expectedIds = initial[0].recovery[0].simulationConfigurations.flatMap((id: string, i: number) => id === reset(0, 0).configurationId ? [initial[0].identity.simulations[i].id] : []);
  expect(expectedIds.length).toBeGreaterThan(1);
  expect(affected.map((e: any) => e.entityId)).toEqual(expectedIds);
  // Force reconstruction before retrying an accepted configuration command.
  const stub = bindings.RADIUS_ROOMS.getByName(projects[0]);
  await evictDurableObject(stub);
  expect((await state()).instance).not.toBe(changedReset.after.instance);
  expect(await (await request(projects[0], 'commands', users[0].cookie, changedReset.body)).json()).toEqual({ ...changedReset.ack, duplicate: true });
  for (const body of [{ ...changedReset.body, operationId: 'stale' }, { ...changedReset.body, edit: reset(0, 1) }]) {
    expect((await request(projects[0], 'commands', users[0].cookie, body)).status).toBe(409); rejectedRequests++;
  }
  if (automaticRing) await accepted(0, 'ring-grow', radius(0, 0.035));
  const shrink = await accepted(0, 'preset-shrink', radius(0, automaticRing ? 0.012 : 0.0005));
  expect(shrink.ack.intrinsic).toMatchObject({ before: { preset: !automaticRing }, after: { preset: false, presetDigest: null,
    thickness: automaticRing ? initial[0].tubes[0].thickness : 0.0005 } });
  const bEqual = await accepted(1, 'b-preset-equal', radius(1, initial[1].tubes[0].radius));
  expect(bEqual.ack.intrinsic.after.presetDigest).toBe(initial[1].tubes[0].preset.digest);
  await accepted(1, 'b-preset-clear', radius(1, 0.041));
  // Deterministically interleave both requests after the first dedup lookup.
  const otherStub = bindings.RADIUS_ROOMS.getByName(projects[1]);
  async function barrier() {
    await runInDurableObject(otherStub, (room: RadiusRoom) => {
      const instance = room as any, original = instance.storeBlob.bind(instance);
      let arrivals = 0, release: () => void;
      const both = new Promise<void>(resolve => { release = resolve; });
      instance.storeBlob = async (...args: unknown[]) => { const key = await original(...args); if (++arrivals === 2) release(); await both; return key; };
    });
  }
  async function restore() { await runInDurableObject(otherStub, (room: RadiusRoom) => { (room as any).storeBlob = Object.getPrototypeOf(room).storeBlob; }); }
  await barrier();
  let current = await state(1);
  const competing = await Promise.all([request(projects[1], 'commands', users[1].cookie, command(current, 'compete-one', automaticRing ? radius(1, 0.042) : reset(1, 1))),
    request(projects[1], 'commands', users[1].cookie, command(current, 'compete-two', automaticRing ? radius(1, 0.043) : reset(1, 2)))]);
  expect(competing.map(r => r.status).sort()).toEqual([200, 409]); rejectedRequests++;
  const winner = competing.find(r => r.status === 200)!; const won = await winner.json() as any;
  const winningEdit = won.operationId === 'compete-one' ? (automaticRing ? radius(1, 0.042) : reset(1, 1)) : (automaticRing ? radius(1, 0.043) : reset(1, 2));
  let filename = 'competing-winner.ork';
  exports.push({ name: filename, base64: toBase64(await archiveBytes(1)) });
  cases.push({ name: 'competing-winner', source: source[1], export: filename, edit: winningEdit, ack: won }); source[1] = filename;
  await restore(); await barrier(); current = await state(1);
  const retry = command(current, 'same-inflight', automaticRing ? radius(1, 0.044) : reset(1, 2));
  const simultaneous = await Promise.all([request(projects[1], 'commands', users[1].cookie, retry), request(projects[1], 'commands', users[1].cookie, retry)]);
  expect(simultaneous.map(r => r.status)).toEqual([200, 200]);
  const acks = await Promise.all(simultaneous.map(r => r.json())) as any[];
  expect(acks.map(a => a.duplicate).sort()).toEqual([false, true]);
  expect({ ...acks[0], duplicate: true }).toEqual({ ...acks[1], duplicate: true });
  await restore(); expect((await state(1)).sequence).toBe(current.sequence + 1);
  filename = 'simultaneous-retry.ork'; exports.push({ name: filename, base64: toBase64(await archiveBytes(1)) });
  cases.push({ name: 'simultaneous-retry', source: source[1], export: filename, edit: retry.edit, ack: acks[0] });
  expect((await state(0)).archiveHash).toBe(shrink.ack.archiveHash);
  await runInDurableObject(otherStub, (_room: RadiusRoom, ctx) => {
    expect(ctx.storage.sql.exec('SELECT COUNT(*) AS count FROM radius_operations').one().count).toBe(current.sequence + 1);
  });
  await context.annotate(JSON.stringify({ schema: 1, automaticRing, runtime: 'actual local workerd', cases, exports, rejectedRequests,
    presetCatalog: initial.map(s => s.tubes[0].preset), digestVectors: bindings.EFFECTS_DIGESTS.length,
    preservation: { lexical: true, attachments: true, ids: true, sidecar: true, flightdata: true, scriptsUnexecuted: true },
    durability: { evictionRetry: true, concurrentIdenticalRetry: true, competingCommands: true, interleavedDifferentProjects: true },
    measurements: { totalLocalWallMs: performance.now() - started, commands: timings, hostedCpu: null, isolateHeap: null } }), 'effects-proof-artifacts');
});
