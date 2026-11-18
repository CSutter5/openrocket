import { DurableObject } from 'cloudflare:workers';
import { Hono } from 'hono';
import { authentication } from './auth';

export interface Bindings {
  DB: D1Database;
  FILES: R2Bucket;
  ROOMS: DurableObjectNamespace<ProofRoom>;
  ASSETS: Fetcher;
  AUTH_SECRET: string;
}
interface Identity { userId: string; sessionId: string; projectId: string }
// Transport persistence probe only; this counter does not validate rocket edits.
interface TransportCommand { protocol: number; modelSchema: number; projectId: string; branchId: string; epoch: number; operationId: string; observedSequence: number; operation: 'increment' }
const error = (code: string, message: string, status = 400) => Response.json({ error: { code, message } }, { status });

export class ProofRoom extends DurableObject<Bindings> {
  private instance = crypto.randomUUID();
  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY CHECK(id=1), project TEXT NOT NULL, owner TEXT NOT NULL, sequence INTEGER NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, author TEXT NOT NULL, sequence INTEGER NOT NULL)');
  }
  // Internal RPC setup is only used through the trusted binding in this proof.
  initialize(projectId: string, ownerId: string) {
    this.ctx.storage.sql.exec('INSERT INTO room (id, project, owner, sequence) VALUES (1, ?, ?, 0) ON CONFLICT(id) DO NOTHING', projectId, ownerId);
  }
  authorize(userId: string): boolean {
    return this.ctx.storage.sql.exec('SELECT owner FROM room WHERE id=1 AND owner=?', userId).toArray().length === 1;
  }
  private state() {
    return this.ctx.storage.sql.exec<{ project: string; owner: string; sequence: number }>('SELECT project, owner, sequence FROM room WHERE id=1').one();
  }
  private async active(identity: Identity) {
    const row = await this.env.DB.prepare('SELECT session.id FROM session JOIN user ON session.user_id=user.id WHERE session.id=? AND user.id=? AND session.expires_at>? AND COALESCE(user.banned,0)=0').bind(identity.sessionId, identity.userId, Date.now()).first();
    return !!row && this.authorize(identity.userId) && identity.projectId === this.state().project;
  }
  private apply(command: TransportCommand, identity: Identity) {
    const state = this.state();
    if (command.protocol !== 1 || command.modelSchema !== 1) return { error: { code: 'version', message: 'Protocol/model schema 1 required' } };
    if (command.projectId !== state.project || command.branchId !== 'main' || command.epoch !== 1 || command.operation !== 'increment' || typeof command.operationId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(command.operationId) || !Number.isSafeInteger(command.observedSequence) || command.observedSequence < 0 || command.observedSequence > state.sequence) return { error: { code: 'invalid', message: 'Invalid bounded transport command' } };
    return this.ctx.storage.transactionSync(() => {
      const duplicate = this.ctx.storage.sql.exec<{ author: string; sequence: number }>('SELECT author, sequence FROM operations WHERE id=?', command.operationId).toArray()[0];
      if (duplicate) {
        if (duplicate.author !== identity.userId) return { error: { code: 'conflict', message: 'Operation ID belongs to a different author' } };
        return { operationId: command.operationId, authorId: duplicate.author, sequence: duplicate.sequence, duplicate: true, instance: this.instance };
      }
      const sequence = this.state().sequence + 1;
      this.ctx.storage.sql.exec('UPDATE room SET sequence=? WHERE id=1', sequence);
      this.ctx.storage.sql.exec('INSERT INTO operations (id, author, sequence) VALUES (?, ?, ?)', command.operationId, identity.userId, sequence);
      return { operationId: command.operationId, authorId: identity.userId, sequence, duplicate: false, instance: this.instance };
    });
  }
  async fetch(request: Request) {
    const session = await authentication(this.env).api.getSession({ headers: request.headers });
    if (!session) return error('forbidden', 'Session required', 401);
    if (!this.authorize(session.user.id)) return error('forbidden', 'Project membership required', 403);
    const state = this.state();
    const identity = { userId: session.user.id, sessionId: session.session.id, projectId: state.project };
    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      if (request.headers.get('origin') !== 'https://proof.openrocket.test') return error('forbidden', 'Origin rejected', 403);
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment(identity);
      pair[1].send(JSON.stringify({ sequence: state.sequence, instance: this.instance, projectId: state.project }));
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    return Response.json({ sequence: state.sequence, instance: this.instance, projectId: state.project });
  }
  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const identity = socket.deserializeAttachment() as Identity;
    if (!await this.active(identity)) { socket.close(1008, 'Session or membership revoked'); return; }
    if (typeof message !== 'string' || message.length > 2048) { socket.close(1009, 'Bounded text messages required'); return; }
    try { socket.send(JSON.stringify(this.apply(JSON.parse(message), identity))); }
    catch { socket.send(JSON.stringify({ error: { code: 'invalid', message: 'Malformed command' } })); }
  }
  webSocketClose(socket: WebSocket, code: number, reason: string) { socket.close([1005, 1006, 1015].includes(code) ? 1000 : code, reason); }
}

const app = new Hono<{ Bindings: Bindings }>();
app.all('/api/auth/*', c => {
  if (new URL(c.req.url).pathname.includes('impersonat')) return error('unsupported', 'Impersonation is disabled', 403);
  return authentication(c.env).handler(c.req.raw);
});
app.get('/health', c => c.json({ runtime: 'workers', protocol: 1, modelSchema: 1 }));
app.get('/projects/:project/ws', async c => {
  if (c.req.header('origin') !== 'https://proof.openrocket.test') return error('forbidden', 'Origin rejected', 403);
  return c.env.ROOMS.getByName(c.req.param('project')).fetch(c.req.raw);
});
app.get('/projects/:project/files/:name', async c => {
  const session = await authentication(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return error('forbidden', 'Session required', 401);
  if (!await c.env.ROOMS.getByName(c.req.param('project')).authorize(session.user.id)) return error('forbidden', 'Project membership required', 403);
  const object = await c.env.FILES.get(`${c.req.param('project')}/${c.req.param('name')}`);
  if (!object) return error('invalid', 'File not found', 404);
  return new Response(object.body, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'private, no-store' } });
});
app.get('*', c => c.env.ASSETS.fetch(c.req.raw));
export default app;
