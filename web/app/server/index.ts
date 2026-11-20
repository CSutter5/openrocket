import type * as CF from '@cloudflare/workers-types';
import { LIMITS } from '@openrocket/ork-format';
import { createDocumentSession } from '../src/document-session';
import { sharedActions, type SharedCommand, type SharedState } from '../src/coediting';
interface Env { ASSETS: CF.Fetcher; SHARED_ROCKET: CF.DurableObjectNamespace }
const chunkSize = 64 * 1024;
const failure = (error: unknown) => error instanceof Error ? error.message : String(error);
export default {
  async fetch(request: CF.Request, env: Env): Promise<CF.Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/coedit') return CFResponse.json({ enabled: true });
    if (url.pathname === '/api/coedit/socket') {
      if (request.headers.get('Origin') !== url.origin) return new CFResponse('Origin refused', { status: 403 });
      return env.SHARED_ROCKET.getByName('everyone').fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
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
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new CFResponse('WebSocket required', { status: 426 });
      const username = new URL(request.url).searchParams.get('username')?.trim() ?? '';
      if (!username || username.length > 40 || /[\x00-\x1f\x7f]/.test(username)) return new CFResponse('Enter a username of 1–40 characters', { status: 400 });
      if (!this.state) {
        const response = await this.env.ASSETS.fetch('https://assets.local/rocket-sample.ork');
        if (!response.ok) throw new Error('Bundled sample unavailable');
        await this.session.execute({ type: 'import', filename: 'rocket-sample.ork', bytes: new Uint8Array(await response.arrayBuffer()) });
        const state = { token: crypto.randomUUID(), snapshot: await this.session.snapshot() };
        await this.persist(state); this.state = state;
      }
      const pair = new Pair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment({ username });
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
    const users = sockets.map(socket => (socket.deserializeAttachment() as { username: string }).username);
    for (const socket of sockets) this.send(socket, { type: 'presence', users });
  }
  async webSocketMessage(socket: CF.WebSocket, message: string | ArrayBuffer) {
    return this.serial(async () => {
      let requestId = '';
      const before = this.state!;
      try {
        if (typeof message !== 'string' || message.length > LIMITS.upload * 4 + 100000) throw new Error('Invalid or oversized command');
        const command = JSON.parse(message) as SharedCommand;
        if (typeof command.requestId !== 'string' || command.requestId.length > 100) throw new Error('Invalid request ID');
        requestId = command.requestId;
        if (!command.action || !sharedActions.has(command.action.type)) throw new Error('Unknown shared command');
        if (command.expectedToken !== before.token) throw new Error('Someone changed the shared file. Review the latest state and try again.');
        const action = command.action.type === 'import' ? { type: 'import' as const, filename: command.action.filename, bytes: new Uint8Array(command.action.bytes) } : command.action;
        if (action.type === 'import' && (typeof action.filename !== 'string' || action.filename.length > 255)) throw new Error('Invalid filename');
        const reply = await this.session.execute(action);
        const state = { token: crypto.randomUUID(), snapshot: await this.session.snapshot() };
        await this.persist(state); this.state = state;
        const username = (socket.deserializeAttachment() as { username: string }).username;
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
