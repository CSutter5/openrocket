import { DurableObject } from 'cloudflare:workers';
import { importArchive, exportArchive, sha256, LIMITS } from '@openrocket/ork-format';
import { tubeRadiusInput, applyTubeRadius, radiusSimulationEffects } from '../../packages/ork-format/src/radius.js';
import { deploymentInput, applyDeploymentReset, deploymentSimulationEffects } from '../../packages/ork-format/src/deployment.js';
import { radiusEdit, presetRadiusEdit, automaticRingRadiusEdit, siblingRingRadiusEdit, resetDeployment } from '../../engine-adapter/build/generated/teavm/js/reducer.js';
import { authentication } from './auth';
import type { Bindings } from './index';
import type { Command, AcceptedCommand, IdentitySidecar } from '@openrocket/contracts';

export interface RadiusBindings extends Bindings { RADIUS_ROOMS: DurableObjectNamespace<RadiusRoom> }
interface Workspace extends Record<string, SqlStorageValue> {
  project: string; owner: string; sequence: number;
  archive: ArrayBuffer | null; sidecar: string | null; hash: string | null;
}
const responseError = (code: string, message: string, status = 400) => Response.json({ error: { code, message } }, { status });
const keys = (value: unknown, names: string[]) => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && Object.keys(value).sort().join(',') === names.sort().join(',');

async function boundedBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Body exceeds proof bound');
      parts.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return bytes;
}

/** Isolated G1 integration proof, not the future collaborative repository. */
export class RadiusRoom extends DurableObject<RadiusBindings> {
  private instance = crypto.randomUUID();
  constructor(ctx: DurableObjectState, env: RadiusBindings) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS radius_workspace (id INTEGER PRIMARY KEY CHECK(id=1), project TEXT NOT NULL, owner TEXT NOT NULL, sequence INTEGER NOT NULL, archive BLOB, sidecar TEXT, hash TEXT)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS radius_operations (id TEXT PRIMARY KEY, author TEXT NOT NULL, request TEXT NOT NULL, acknowledgment TEXT NOT NULL)');
  }
  // Trusted test binding only; there is no public setup or ownership endpoint.
  initialize(project: string, owner: string) {
    if (!/^[a-z0-9-]{1,64}$/.test(project)) throw new Error('Invalid project');
    this.ctx.storage.sql.exec('INSERT INTO radius_workspace (id,project,owner,sequence) VALUES (1,?,?,0) ON CONFLICT(id) DO NOTHING', project, owner);
  }
  private workspace() {
    return this.ctx.storage.sql.exec<Workspace>('SELECT project,owner,sequence,archive,sidecar,hash FROM radius_workspace WHERE id=1').toArray()[0];
  }
  private async active(userId: string, sessionId: string) {
    return !!await this.env.DB.prepare('SELECT session.id FROM session JOIN user ON session.user_id=user.id WHERE session.id=? AND user.id=? AND session.expires_at>? AND COALESCE(user.banned,0)=0').bind(sessionId, userId, Date.now()).first();
  }
  private async archive(state: Workspace) {
    if (!state.archive || !state.sidecar) throw new Error('Import required');
    return importArchive(new Uint8Array(state.archive), JSON.parse(state.sidecar) as IdentitySidecar);
  }
  private async storeBlob(project: string, hash: string, bytes: Uint8Array) {
    // Immutable blobs precede SQL publication. A conflicting request can leave an
    // unreachable blob; the acknowledged SQL workspace always remains complete.
    const key = `${project}/radius/${hash}.ork`;
    await this.env.FILES.put(key, bytes, { customMetadata: { sha256: hash } });
    return key;
  }
  private retry(operationId: string, author: string, request: string) {
    const operation = this.ctx.storage.sql.exec<{ author: string; request: string; acknowledgment: string }>('SELECT author,request,acknowledgment FROM radius_operations WHERE id=?', operationId).toArray()[0];
    if (!operation) return;
    if (operation.author !== author || operation.request !== request) return responseError('conflict', 'Operation ID reused', 409);
    return Response.json({ ...JSON.parse(operation.acknowledgment), duplicate: true });
  }
  async fetch(request: Request) {
    const session = await authentication(this.env).api.getSession({ headers: request.headers });
    if (!session) return responseError('forbidden', 'Session required', 401);
    const state = this.workspace();
    const path = new URL(request.url).pathname;
    if (!state || state.owner !== session.user.id || !path.startsWith(`/radius/${state.project}/`)) return responseError('forbidden', 'Project membership required', 403);
    if (request.method === 'POST' && request.headers.get('origin') !== this.env.AUTH_BASE_URL) return responseError('forbidden', 'Origin rejected', 403);
    const active = () => this.active(session.user.id, session.session.id);
    try {
      if (request.method === 'POST' && path === `/radius/${state.project}/import`) {
        if (state.archive) return responseError('conflict', 'Proof workspace already imported', 409);
        const bytes = await boundedBody(request, LIMITS.upload);
        const archive = await importArchive(bytes);
        if (archive.mode !== 'editable') return responseError('unsupported', 'Archive is preservation-only', 422);
        const hash = await sha256(bytes);
        await this.storeBlob(state.project, hash, bytes);
        if (!await active()) return responseError('forbidden', 'Session revoked', 401);
        return this.ctx.storage.transactionSync(() => {
          const current = this.workspace();
          if (current?.owner !== session.user.id) return responseError('forbidden', 'Membership revoked', 403);
          if (current.archive) return responseError('conflict', 'Concurrent import', 409);
          this.ctx.storage.sql.exec('UPDATE radius_workspace SET archive=?,sidecar=?,hash=? WHERE id=1', bytes.slice().buffer, JSON.stringify(archive.identity), hash);
          return Response.json({ projectId: state.project, sequence: 0, archiveHash: hash });
        });
      }
      if (!state.archive) return responseError('invalid', 'Import required', 409);
      if (request.method === 'GET' && path === `/radius/${state.project}/export`) {
        return new Response(state.archive, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'private, no-store', 'X-Archive-Hash': state.hash!, 'X-Workspace-Sequence': String(state.sequence) } });
      }
      if (request.method === 'GET' && path === `/radius/${state.project}/state`) {
        const archive = await this.archive(state);
        const functionalEdit = this.ctx.storage.sql.exec<{ acknowledgment: string }>('SELECT acknowledgment FROM radius_operations').toArray().some(row => {
          const effect = JSON.parse(row.acknowledgment).intrinsic;
          return effect.functionalChange === true || effect.before.radius !== effect.after.radius || effect.before.thickness !== effect.after.thickness;
        });
        return Response.json({ projectId: state.project, branchId: 'main', epoch: 1, sequence: state.sequence,
          archiveHash: state.hash, identity: archive.identity, instance: this.instance,
          importedResults: functionalEdit ? 'stale-after-edit' : 'unverified-import',
          simulationStatuses: archive.parsed.simulations.map((node, i) => ({ id: archive.identity.simulations[i].id, status: node.attributes.status?.value })),
          tubes: archive.parsed.components.filter(n => n.name === 'bodytube').map(n => {
            try { return tubeRadiusInput(archive, n.id ?? ''); } catch (error) { return { componentId: n.id, unsupported: String(error) }; }
          }),
          recovery: archive.parsed.components.filter(n => n.name === 'parachute').map(n => {
            try { return deploymentInput(archive, n.id ?? ''); } catch (error) { return { componentId: n.id, unsupported: String(error) }; }
          }) });
      }
      if (request.method !== 'POST' || path !== `/radius/${state.project}/commands`) return responseError('invalid', 'Unknown proof endpoint', 404);
      const input = JSON.parse(new TextDecoder().decode(await boundedBody(request, 8192)));
      if (!keys(input, ['protocol', 'modelSchema', 'projectId', 'branchId', 'epoch', 'operationId', 'observedSequence', 'preconditions', 'edit', ...(Object.hasOwn(input ?? {}, 'authorId') ? ['authorId'] : [])])) return responseError('invalid', 'Typed command required');
      if (input.protocol !== 1 || input.modelSchema !== 1) return responseError('version', 'Protocol/model schema 1 required');
      if (input.projectId !== state.project || input.branchId !== 'main' || input.epoch !== 1) return responseError('resync', 'Workspace mismatch', 409);
      const radiusCommand = input.edit?.type === 'setOuterRadius';
      const deploymentCommand = input.edit?.type === 'resetDeploymentConfiguration';
      if (typeof input.operationId !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(input.operationId) || !Number.isSafeInteger(input.observedSequence) || input.observedSequence < 0 ||
          typeof input.edit?.componentId !== 'string' || !Array.isArray(input.preconditions) ||
          !(radiusCommand && keys(input.edit, ['type', 'componentId', 'value']) && Number.isFinite(input.edit.value) && input.edit.value > 0 && input.edit.value <= 1 ||
            deploymentCommand && keys(input.edit, ['type', 'componentId', 'configurationId']) && typeof input.edit.configurationId === 'string')) return responseError('invalid', 'Invalid bounded imported command');
      if (!input.preconditions.every((p: unknown) => keys(p, ['entityId', 'field', 'expected']))) return responseError('invalid', 'Invalid preconditions');
      const command: Command = { protocol: 1, modelSchema: 1, projectId: state.project, branchId: 'main', epoch: 1,
        operationId: input.operationId, observedSequence: input.observedSequence,
        edit: radiusCommand ? { type: 'setOuterRadius', componentId: input.edit.componentId, value: input.edit.value } :
          { type: 'resetDeploymentConfiguration', componentId: input.edit.componentId, configurationId: input.edit.configurationId },
        preconditions: input.preconditions.map((p: Command['preconditions'][number]) => ({ entityId: p.entityId, field: p.field, expected: p.expected })).sort((a: Command['preconditions'][number], b: Command['preconditions'][number]) => String(a.field).localeCompare(String(b.field))) };
      const requestText = JSON.stringify(command);
      const duplicate = this.retry(command.operationId, session.user.id, requestText);
      if (duplicate) return duplicate;
      if (command.observedSequence !== state.sequence) return responseError('conflict', 'Sequence conflict', 409);
      const archive = await this.archive(state);
      const target = radiusCommand ? tubeRadiusInput(archive, input.edit.componentId) : deploymentInput(archive, input.edit.componentId);
      const expected = [
        { entityId: state.project, field: 'archiveHash', expected: state.hash },
        ...Object.entries(target).filter(([field]) => field !== 'schema' && field !== 'componentId').map(([field, value]) => ({ entityId: target.componentId, field, expected: value })),
        ...(radiusCommand ? [{ entityId: target.componentId, field: 'automatic', expected: false },
          ...('preset' in target ? [] : [{ entityId: target.componentId, field: 'preset', expected: false }])] : []),
      ].sort((a, b) => a.field.localeCompare(b.field));
      if (JSON.stringify(command.preconditions) !== JSON.stringify(expected)) return responseError('conflict', 'Complete imported read/effect preconditions required', 409);
      let effects: any, simulationEffects: { index: number; before: string; after: string }[], changed;
      const domainEffects: AcceptedCommand['effects'] = [];
      if (radiusCommand) {
        const tube = tubeRadiusInput(archive, input.edit.componentId);
        effects = JSON.parse(tube.ring?.sibling
          ? siblingRingRadiusEdit(tube.preset?.key ?? '', tube.preset?.digest ?? '', tube.length, tube.radius, tube.thickness,
            tube.filled, tube.density, tube.ring.length, tube.ring.density, tube.ring.axialOffset, tube.configurationIds!.join(';'), input.edit.value,
            tube.ring.sibling.length, tube.ring.sibling.outerRadius, tube.ring.sibling.thickness, tube.ring.sibling.density, tube.ring.sibling.axialOffset, tube.ring.precedingNoseLength!)
          : tube.ring
          ? automaticRingRadiusEdit(tube.preset?.key ?? '', tube.preset?.digest ?? '', tube.length, tube.radius, tube.thickness,
            tube.filled, tube.density, tube.ring.length, tube.ring.innerRadius, tube.ring.density, tube.ring.axialOffset, tube.configurationIds!.join(';'), input.edit.value)
          : tube.preset
          ? presetRadiusEdit(tube.preset.key, tube.preset.digest, tube.length, tube.radius, tube.thickness, tube.filled, tube.density, input.edit.value)
          : radiusEdit(tube.length, tube.radius, tube.thickness, tube.filled, tube.density, input.edit.value));
        simulationEffects = radiusSimulationEffects(archive, tube, effects.after);
        changed = await applyTubeRadius(archive, tube, effects.after);
        for (const field of ['radius', 'thickness', 'automatic', 'preset', ...(tube.preset || tube.ring ? ['presetDigest'] : [])]) {
          domainEffects.push({ entityId: tube.componentId, field, before: effects.before[field], after: effects.after[field] });
        }
        if (tube.ring) domainEffects.push({ entityId: tube.ring.componentId, field: 'derivedGeometry', before: effects.before.ring, after: effects.after.ring });
      } else {
        const recovery = deploymentInput(archive, input.edit.componentId);
        effects = JSON.parse(resetDeployment(recovery.default.event, recovery.default.altitude, recovery.default.delay,
          recovery.overrides.map(o => [o.id, o.parameters.event, o.parameters.altitude, o.parameters.delay].join(',')).join(';'),
          recovery.configurationIds.join(';'), input.edit.configurationId));
        simulationEffects = deploymentSimulationEffects(archive, recovery, input.edit.configurationId, effects);
        changed = await applyDeploymentReset(archive, recovery, input.edit.configurationId, effects);
        domainEffects.push({ entityId: recovery.componentId, field: `deployment:${input.edit.configurationId}`, before: effects.before, after: effects.after });
      }
      const output = await exportArchive(changed);
      const archiveHash = await sha256(output.bytes);
      const blobKey = await this.storeBlob(state.project, archiveHash, output.bytes);
      if (!await active()) return responseError('forbidden', 'Session revoked', 401);
      return this.ctx.storage.transactionSync(() => {
        const current = this.workspace();
        // All asynchronous parsing, hashing, R2 and D1 work has completed. Publish
        // only if its exact source revision and membership still hold.
        if (current?.owner !== session.user.id) return responseError('forbidden', 'Membership revoked', 403);
        // An identical in-flight request may have committed while this request
        // awaited blob/authorization work. Return that original acknowledgment.
        const retry = this.retry(command.operationId, session.user.id, requestText);
        if (retry) return retry;
        if (current.sequence !== state.sequence || current.hash !== state.hash) return responseError('conflict', 'Concurrent edit; reload preconditions', 409);
        if (this.ctx.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM radius_operations').one().count >= 32) return responseError('resync', 'Proof retry window exhausted', 409);
        const sequence = current.sequence + 1;
        const acknowledgment: AcceptedCommand & { archiveHash: string; blobKey: string; intrinsic: unknown } = {
          protocol: 1, projectId: state.project, branchId: 'main', epoch: 1, operationId: command.operationId, sequence, authorId: session.user.id,
          effects: [
            ...domainEffects,
            ...simulationEffects.map(effect => ({ entityId: archive.identity.simulations[effect.index].id, field: 'status', before: effect.before, after: effect.after })),
          ],
          archiveHash, blobKey, intrinsic: effects,
        };
        this.ctx.storage.sql.exec('UPDATE radius_workspace SET sequence=?,archive=?,sidecar=?,hash=? WHERE id=1', sequence, output.bytes.slice().buffer, JSON.stringify(output.identity), archiveHash);
        this.ctx.storage.sql.exec('INSERT INTO radius_operations (id,author,request,acknowledgment) VALUES (?,?,?,?)', command.operationId, session.user.id, requestText, JSON.stringify(acknowledgment));
        return Response.json({ ...acknowledgment, duplicate: false });
      });
    } catch (error) {
      return responseError('unsupported', error instanceof Error ? error.message : 'Rejected radius proof request', 422);
    }
  }
}
