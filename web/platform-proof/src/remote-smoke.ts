import { constantTimeEqual } from 'better-auth/crypto';
import { authentication, bootstrapOperator } from './auth';
import application, { type Bindings } from './index';

interface RemoteBindings extends Bindings { PROOF_OPERATOR_SECRET: string }
interface Setup { adminEmail: string; ownerEmail: string; otherEmail: string; password: string }

// This module is selected only by an isolated staging configuration. The regular
// Worker entry point does not expose this route or import this wrapper.
export default {
  async fetch(request: Request, env: RemoteBindings, ctx: ExecutionContext) {
    const path = new URL(request.url).pathname;
    if (!['/__g1/setup', '/__g1/ready'].includes(path)) return application.fetch(request, env, ctx);
    const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
    if (request.method !== (path === '/__g1/ready' ? 'GET' : 'POST') || new URL(request.url).origin !== env.AUTH_BASE_URL || !env.PROOF_OPERATOR_SECRET || !constantTimeEqual(token, env.PROOF_OPERATOR_SECRET)) return new Response(null, { status: 403 });
    if (path === '/__g1/ready') return new Response(env.AUTH_SECRET?.length >= 32 ? 'ready' : 'not ready', { status: env.AUTH_SECRET?.length >= 32 ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
    const body = await request.text();
    if (body.length > 2048) return new Response(null, { status: 413 });
    let setup: Setup;
    try {
      setup = JSON.parse(body);
      if (!setup || !['adminEmail', 'ownerEmail', 'otherEmail', 'password'].every(field => typeof setup[field as keyof Setup] === 'string')) return new Response(null, { status: 400 });
    } catch { return new Response(null, { status: 400 }); }
    try { await env.DB.prepare('INSERT INTO proof_remote_setup (id) VALUES (1)').run(); }
    catch { return new Response(null, { status: 409 }); }
    let phase = 'bootstrap-admin';
    try {
      const admin = await bootstrapOperator(env, setup.adminEmail, setup.password);
      const auth = authentication(env);
      phase = 'create-owner';
      const owner = await auth.api.createUser({ body: { email: setup.ownerEmail, password: setup.password, name: 'G1 fixture owner', role: 'user' } });
      phase = 'create-other';
      const other = await auth.api.createUser({ body: { email: setup.otherEmail, password: setup.password, name: 'G1 fixture other', role: 'user' } });
      phase = 'initialize-rooms';
      await env.ROOMS.getByName('g1-project-a').initialize('g1-project-a', owner.user.id);
      await env.ROOMS.getByName('g1-project-b').initialize('g1-project-b', other.user.id);
      phase = 'write-private-blob';
      await env.FILES.put('g1-project-a/design.ork', 'g1 private runtime fixture');
      return Response.json({ adminId: admin.id, ownerId: owner.user.id, otherId: other.user.id });
    } catch (error) {
      const errorType = error instanceof Error && /^[A-Za-z0-9_]{1,64}$/.test(error.name) ? error.name : 'Unknown';
      console.error(JSON.stringify({ type: 'g1-setup-failure', phase, errorType }));
      // No errors/bodies/passwords are reflected or logged. Setup is deliberately
      // consumed even on failure: delete only this proof's resources and retry fresh.
      return Response.json({ error: { code: 'invalid', message: 'Isolated setup failed; clean up this proof and start a fresh namespace', phase, errorType } }, { status: 500 });
    }
  },
} satisfies ExportedHandler<RemoteBindings>;

export { ProofRoom } from './index';
