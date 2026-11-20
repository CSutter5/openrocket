import type * as CF from '@cloudflare/workers-types';
import { LIMITS, componentNames, renameComponent, exportArchive } from '@openrocket/ork-format';
import { newRocket } from '../src/components';
import { createDocumentSession } from '../src/document-session';
import { sharedActions, type SharedCommand, type SharedState } from '../src/coediting';
import { accountSession } from './access';
import type { Env, SocketIdentity } from './env';
const chunkSize = 64 * 1024;
const failure = (error: unknown) => error instanceof Error ? error.message : String(error);
// Workers provide these globals; aliases keep browser and server types separate.
const CFResponse = Response as unknown as typeof CF.Response;
const Pair = (globalThis as unknown as { WebSocketPair: { new(): { 0: CF.WebSocket; 1: CF.WebSocket } } }).WebSocketPair;
export class SharedRocket {
  private session;
  private state?: SharedState;
  private queue = Promise.resolve();
  constructor(private ctx: CF.DurableObjectState, private env: Env) {
    this.session = createDocumentSession(async () => null, (input) => env.ASSETS.fetch(new URL(String(input), 'https://assets.local').href) as unknown as Promise<Response>);
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<Omit<SharedState, 'snapshot'> & { snapshot: Omit<SharedState['snapshot'], 'bytes'>; length: number }>('current');
      if (!stored) return;
      const bytes: number[] = [];
      for (let i = 0; i < stored.length; i += chunkSize) {
        const chunk = await ctx.storage.get<Uint8Array>(`bytes:${i / chunkSize}`);
        if (!chunk) throw new Error('Shared draft is incomplete');
        for (const byte of chunk) bytes.push(byte);
      }
      this.state = { token: stored.token, snapshot: { ...stored.snapshot, bytes } };
      await this.restore(this.state);
    });
  }
  private restore(state: SharedState) {
    return this.session.execute({ type: 'sync', ...state.snapshot, bytes: new Uint8Array(state.snapshot.bytes) });
  }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work);
    this.queue = next.then(() => {}, () => {});
    return next;
  }
  private async persist(state: SharedState) {
    const { bytes, ...snapshot } = state.snapshot;
    if (bytes.length > LIMITS.upload) throw new Error('Shared draft exceeds the 4 MiB limit');
    await this.ctx.storage.transaction(async storage => {
      const old = await storage.list({ prefix: 'bytes:' });
      await storage.delete([...old.keys()]);
      for (let i = 0; i < bytes.length; i += chunkSize) await storage.put(`bytes:${i / chunkSize}`, new Uint8Array(bytes.slice(i, i + chunkSize)));
      await storage.put('current', { token: state.token, snapshot, length: bytes.length });
    });
  }
  async fetch(request: CF.Request) {
    return this.serial(async () => {
      const url = new URL(request.url);
      if (url.pathname === '/delete-rocket' && request.method === 'POST') {
        const actor = await accountSession(this.env, request.headers), id = request.headers.get('X-Rocket-Id');
        if (!actor) return CFResponse.json({ error: 'Sign in to delete a rocket' }, { status: 401 });
        const rocket = await this.env.DB.prepare('SELECT owner_id AS ownerId FROM rocket WHERE id=?').bind(id).first<{ ownerId: string }>();
        if (!rocket) return CFResponse.json({ error: 'Rocket not found' }, { status: 404 });
        if (actor.user.mustChangePassword || actor.user.id !== rocket.ownerId && !actor.user.isAdmin) return CFResponse.json({ error: 'Only the owner or administrator can delete this rocket' }, { status: 403 });
        await this.env.DB.prepare('UPDATE rocket SET deleted_at=? WHERE id=?').bind(Date.now(), id).run();
        for (const socket of this.ctx.getWebSockets()) { this.send(socket, { type: 'deleted' });socket.close(1008, 'Rocket deleted'); }
        await this.ctx.storage.deleteAll();this.state = undefined;
        await this.env.DB.prepare('DELETE FROM rocket WHERE id=?').bind(id).run();
        return CFResponse.json({ deleted: true });
      }
      // Only the API's trusted binding calls these paths; public routes forward socket URLs.
      if (url.pathname === '/initialize-upload' && request.method === 'POST') {
        if (this.state) return CFResponse.json({ error: 'Rocket already initialized' }, { status: 409 });
        try { await this.session.execute({ type: 'import', filename: url.searchParams.get('filename')!, bytes: new Uint8Array(await request.arrayBuffer()) }); }
        catch (error) { return CFResponse.json({ error: failure(error) }, { status: 400 }); }
        const state = { token: crypto.randomUUID(), snapshot: await this.session.snapshot() };
        await this.persist(state);this.state = state;
        return CFResponse.json({ initialized: true });
      }
      if (url.pathname === '/discard-upload' && request.method === 'POST') {
        if (await this.env.DB.prepare('SELECT id FROM rocket WHERE id=?').bind(url.searchParams.get('rocketId')).first()) return new CFResponse('Rocket already published', { status: 409 });
        await this.ctx.storage.deleteAll();this.state = undefined;
        return new CFResponse(null, { status: 204 });
      }
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new CFResponse('WebSocket required', { status: 426 });
      const rocketId = request.headers.get('X-Rocket-Id');
      if (!rocketId) return new CFResponse('Rocket not found', { status: 404 });
      const activeRocket = await this.env.DB.prepare('SELECT rocket.id FROM rocket JOIN user ON user.id=rocket.owner_id WHERE rocket.id=? AND rocket.deleted_at IS NULL AND user.deleting=0').bind(rocketId).first();
      if (!activeRocket) return new CFResponse('Rocket not found', { status: 404 });
      const session = await accountSession(this.env, request.headers);
      const identity: SocketIdentity = { rocketId, username: session?.user.username ?? 'Visitor', ...(session ? { sessionId: session.session.id, userId: session.user.id } : {}) };
      if (!this.state) {
        const rocket = await this.env.DB.prepare('SELECT name, slug FROM rocket WHERE id=?').bind(rocketId).first<{ name: string; slug: string }>();
        if (!rocket) return new CFResponse('Rocket not found', { status: 404 });
        const created = await newRocket(), root = componentNames(created)[0];
        const exported = await exportArchive(await renameComponent(created, root.id!, root.name!, rocket.name));
        await this.session.execute({ type: 'sync', bytes: exported.bytes, identity: exported.identity, filename: `${rocket.slug}.ork` });
        const state = { token: crypto.randomUUID(), snapshot: await this.session.snapshot() };
        await this.persist(state); this.state = state;
      }
      const pair = new Pair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment(identity);
      pair[1].send(JSON.stringify({ type: 'access', canEdit: !!session && !session.user.mustChangePassword, username: identity.username }));
      pair[1].send(JSON.stringify({ type: 'state', state: this.state }));
      this.presence();
      return new CFResponse(null, { status: 101, webSocket: pair[0] });
    });
  }
  private send(socket: CF.WebSocket, message: unknown) {
    try { socket.send(JSON.stringify(message)); } catch { /* Reconnect receives the latest durable draft. */ }
  }
  private presence(excluded?: CF.WebSocket) {
    const sockets = this.ctx.getWebSockets().filter(socket => socket !== excluded);
    const users = sockets.map(socket => (socket.deserializeAttachment() as SocketIdentity).username);
    for (const socket of sockets) this.send(socket, { type: 'presence', users });
  }
  private async requireEditor(socket: CF.WebSocket) {
    const identity = socket.deserializeAttachment() as SocketIdentity;
    const active = identity.sessionId && await this.env.DB.prepare('SELECT session.id FROM session JOIN user ON session.user_id=user.id JOIN rocket ON rocket.id=? JOIN user AS owner ON owner.id=rocket.owner_id LEFT JOIN app_admin ON app_admin.user_id=user.id WHERE session.id=? AND session.user_id=? AND session.expires_at>? AND user.deleting=0 AND owner.deleting=0 AND rocket.deleted_at IS NULL AND COALESCE(app_admin.must_change_password,0)=0')
      .bind(identity.rocketId, identity.sessionId, identity.userId, Date.now()).first();
    if (!active) {
      this.send(socket, { type: 'access', canEdit: false, username: identity.username });
      throw new Error('Sign in to edit this public rocket');
    }
    return identity;
  }
  async webSocketMessage(socket: CF.WebSocket, message: string | ArrayBuffer) {
    return this.serial(async () => {
      let requestId = '';
      const before = this.state;
      if (!before) { this.send(socket, { type: 'deleted' });socket.close(1008, 'Rocket deleted');return; }
      try {
        if (typeof message !== 'string' || message.length > LIMITS.upload * 4 + 100000) throw new Error('Invalid or oversized command');
        const command = JSON.parse(message) as SharedCommand;
        if (typeof command.requestId !== 'string' || command.requestId.length > 100) throw new Error('Invalid request ID');
        requestId = command.requestId;
        const identity = await this.requireEditor(socket);
        if (!command.action || !sharedActions.has(command.action.type)) throw new Error('Unknown shared command');
        if (command.expectedToken !== before.token) throw new Error('Someone changed the shared file. Review the latest state and try again.');
        const action = command.action.type === 'import' ? { type: 'import' as const, filename: command.action.filename, bytes: new Uint8Array(command.action.bytes) } : command.action;
        if (action.type === 'import' && (typeof action.filename !== 'string' || action.filename.length > 255)) throw new Error('Invalid filename');
        const reply = await this.session.execute(action);
        const state = { token: crypto.randomUUID(), snapshot: await this.session.snapshot() };
        await this.requireEditor(socket);
        await this.persist(state); this.state = state;
        const username = identity.username;
        for (const peer of this.ctx.getWebSockets()) this.send(peer, { type: 'state', state,
          ...(peer === socket ? { requestId, notice: reply.notice, selectedId: reply.selectedId, configurationId: reply.configurationId } : { notice: `${username} updated the shared file.` }) });
      } catch (error) {
        await this.restore(before);
        this.send(socket, { type: 'state', state: before });
        this.send(socket, { type: 'rejected', requestId, error: failure(error) });
      }
    });
  }
  webSocketClose(socket: CF.WebSocket) { this.presence(socket); }
  webSocketError(socket: CF.WebSocket) { this.presence(socket); }
}
