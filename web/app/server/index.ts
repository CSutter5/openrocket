import type * as CF from '@cloudflare/workers-types';
import { LIMITS } from '@openrocket/ork-format';
import { authentication, validUsername } from './auth';
import type { Env } from './env';
import type { PublicRocket as Rocket } from '../src/accounts';
export { SharedRocket } from './room';
import { CFResponse, json, fail, body, readBody } from './http';
import { accountSession, changePassword } from './access';
import { adminApi, deleteRocket } from './management';
const authPaths = new Set(['/sign-up/email', '/sign-in/username', '/get-session', '/sign-out']);
const slugPattern = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const rocketQuery = 'SELECT rocket.id, rocket.name, rocket.slug, rocket.owner_id AS ownerId, user.username FROM rocket JOIN user ON rocket.owner_id=user.id';
async function api(request: CF.Request, env: Env): Promise<CF.Response> {
  const url = new URL(request.url), path = url.pathname;
  if (path === '/api/coedit') return json({ enabled: true, accounts: true });
  if (path.startsWith('/api/auth/')) {
    const route = path.slice('/api/auth'.length);
    if (!authPaths.has(route)) return fail('Account operation unavailable', 404);
    let credential: { userId: string; password: string } | null = null;
    if (request.method === 'POST') {
      if (request.headers.get('Origin') !== new URL(env.AUTH_BASE_URL).origin) return fail('Origin refused', 403);
      const data = await body(request.clone());
      if (route === '/sign-in/username' && typeof data.username === 'string') credential = await env.DB.prepare("SELECT account.user_id AS userId, account.password FROM account JOIN user ON user.id=account.user_id WHERE user.username=? AND account.provider_id='credential'").bind(data.username.toLowerCase()).first();
      if (route === '/sign-up/email' && (typeof data.username !== 'string' || !validUsername(data.username.toLowerCase()))) return fail('Use a username of 3–32 letters, digits, hyphens or underscores, starting with a letter', 400);
    }
    const response = await authentication(env).handler(request as unknown as Request);
    if (credential && response.ok) {
      const current = await env.DB.prepare("SELECT password FROM account WHERE user_id=? AND provider_id='credential'").bind(credential.userId).first<{ password: string }>();
      if (current?.password !== credential.password) {
        const signedIn = await response.clone().json() as { token: string };
        await env.DB.prepare('DELETE FROM session WHERE token=?').bind(signedIn.token).run();
        return fail('Password changed during sign-in. Sign in again.', 401);
      }
    }
    return response as unknown as CF.Response;
  }
  if (path === '/api/account/password' && request.method === 'POST') return changePassword(request, env);
  if (path.startsWith('/api/admin/')) return adminApi(request, env);
  if (path === '/api/session') {
    const session = await accountSession(env, request.headers);
    return json({ user: session ? session.user : null });
  }
  if (path === '/api/rockets' && request.method === 'GET') {
    const owner = url.searchParams.get('owner');
    const query = env.DB.prepare(rocketQuery + ' WHERE rocket.deleted_at IS NULL AND user.deleting=0' + (owner ? ' AND user.username=?' : '') + ' ORDER BY rocket.created_at DESC, rocket.id');
    const rockets = await (owner ? query.bind(owner) : query).all<Rocket>();
    return json({ rockets: rockets.results });
  }
  if (path === '/api/rockets' && request.method === 'POST') {
    if (request.headers.get('Origin') !== new URL(env.AUTH_BASE_URL).origin) return fail('Origin refused', 403);
    const session = await accountSession(env, request.headers);
    if (!session) return fail('Sign in to create a rocket', 401);
    if (session.user.mustChangePassword) return fail('Change your temporary password first', 403);
    let data: { name?: unknown; slug?: unknown }, file: File | undefined;
    if (request.headers.get('Content-Type')?.startsWith('multipart/form-data')) {
      const bytes = await readBody(request, LIMITS.upload + 16384);
      let form: FormData;
      try { form = await new Response(bytes, { headers: { 'Content-Type': request.headers.get('Content-Type')! } }).formData(); }
      catch { return fail('Invalid upload form', 400); }
      const upload = form.get('file');
      if (!(upload instanceof File) || form.getAll('file').length !== 1) return fail('Choose one .ork file to upload', 400);
      if (upload.size > LIMITS.upload) return fail('File exceeds the 4 MiB upload limit', 400);
      if (upload.name.length > 255 || /[\x00-\x1f\x7f]/.test(upload.name)) return fail('Invalid filename', 400);
      file = upload;data = { name: form.get('name') };
    } else data = await body(request);
    if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 100 || /[\x00-\x1f\x7f]/.test(data.name)) return fail('Enter a rocket name of 1–100 characters', 400);
    if (data.slug !== undefined && (typeof data.slug !== 'string' || data.slug.length > 80 || !slugPattern.test(data.slug))) return fail('Use a URL name of lowercase letters, digits, hyphens or underscores', 400);
    const automatic = data.slug === undefined;
    const base = automatic ? data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80).replace(/^-|-$/g, '') || 'rocket' : data.slug as string;
    const rocket: Rocket = { id: crypto.randomUUID(), name: data.name.trim(), slug: base, ownerId: session.user.id, username: session.user.username! };
    const room = env.SHARED_ROCKET.getByName(`rocket:${rocket.id}`);
    let staged = false, published = false;
    try {
      if (file) {
        const address = new URL('https://room.internal/initialize-upload');address.searchParams.set('filename', file.name);
        const initialized = await room.fetch(new Request(address, { method: 'POST', body: await file.arrayBuffer() }) as unknown as CF.Request);
        if (!initialized.ok) return fail((await initialized.json() as { error: string }).error, initialized.status);
        staged = true;
      }
      const existing = automatic ? (await env.DB.prepare('SELECT slug FROM rocket WHERE owner_id=?').bind(rocket.ownerId).all<{ slug: string }>()).results : [];
      const taken = new Set(existing.map(row => row.slug));let number = 1;
      for (;;) {
        if (automatic) {
          while (taken.has(rocket.slug)) { const suffix = `-${++number}`;rocket.slug = base.slice(0, 80 - suffix.length).replace(/-$/, '') + suffix; }
        }
        try { const inserted = await env.DB.prepare('INSERT INTO rocket(id, owner_id, name, slug, created_at) SELECT ?, id, ?, ?, ? FROM user WHERE id=? AND deleting=0').bind(rocket.id, rocket.name, rocket.slug, Date.now(), rocket.ownerId).run();if (!inserted.meta.changes) return fail('Account is unavailable', 401);break; }
        catch (error) {
          if (!await env.DB.prepare('SELECT id FROM rocket WHERE owner_id=? AND slug=?').bind(rocket.ownerId, rocket.slug).first()) throw error;
          if (!automatic) return fail('You already have a rocket at that URL', 409);
          taken.add(rocket.slug);
        }
      }
      published = true;
      return json({ rocket }, 201);
    } finally {
      if (staged && !published) await room.fetch(`https://room.internal/discard-upload?rocketId=${rocket.id}`, { method: 'POST' });
    }
  }
  const match = /^\/api\/rockets\/([a-z][a-z0-9_-]{2,31})\/([a-z0-9_-]{1,80})(\/(?:socket|rename))?$/.exec(path);
  if (match) {
    const rocket = await env.DB.prepare(rocketQuery + ' WHERE user.username=? AND rocket.slug=?' + (request.method === 'DELETE' ? '' : ' AND rocket.deleted_at IS NULL AND user.deleting=0')).bind(match[1], match[2]).first<Rocket>();
    if (!rocket) return fail('Rocket not found', 404);
    if (match[3] === '/rename' && request.method === 'POST') {
      if (request.headers.get('Origin') !== new URL(env.AUTH_BASE_URL).origin) return fail('Origin refused', 403);
      const session = await accountSession(env, request.headers);
      if (!session) return fail('Sign in to rename a rocket', 401);
      if (session.user.mustChangePassword || session.user.id !== rocket.ownerId && !session.user.isAdmin) return fail('Only the owner or administrator can rename this rocket', 403);
      const data = await body(request);
      if (data.rocketId !== rocket.id || data.expectedName !== rocket.name) return fail('Rocket changed. Reload before renaming it.', 409);
      if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 100 || /[\x00-\x1f\x7f]/.test(data.name)) return fail('Enter a rocket name of 1–100 characters', 400);
      const name = data.name.trim();
      const changed = await env.DB.prepare('UPDATE rocket SET name=? WHERE id=? AND name=? AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM user WHERE id=rocket.owner_id AND deleting=0)').bind(name, rocket.id, rocket.name).run();
      if (!changed.meta.changes) return fail('Rocket changed. Reload before renaming it.', 409);
      return json({ rocket: { ...rocket, name } });
    }
    if (request.method === 'DELETE' && !match[3]) {
      if (request.headers.get('Origin') !== new URL(env.AUTH_BASE_URL).origin) return fail('Origin refused', 403);
      const session = await accountSession(env, request.headers);
      if (!session) return fail('Sign in to delete a rocket', 401);
      if (session.user.mustChangePassword || session.user.id !== rocket.ownerId && !session.user.isAdmin) return fail('Only the owner or administrator can delete this rocket', 403);
      if (url.searchParams.get('rocketId') !== rocket.id) return fail('Rocket changed. Reload before deleting it.', 409);
      return deleteRocket(env, rocket.id, request.headers);
    }
    if (match[3] === '/socket') {
      if (url.searchParams.has('rocketId') && url.searchParams.get('rocketId') !== rocket.id) return fail('Rocket not found', 404);
      if (request.headers.get('Origin') !== new URL(env.AUTH_BASE_URL).origin) return fail('Origin refused', 403);
      const forwarded = new Request(request.url, request as unknown as Request);
      forwarded.headers.set('X-Rocket-Id', rocket.id);
      return env.SHARED_ROCKET.getByName(`rocket:${rocket.id}`).fetch(forwarded as unknown as CF.Request);
    }
    if (request.method === 'GET' && !match[3]) return json({ rocket });
  }
  return fail('Not found', 404);
}
export default {
  async fetch(request: CF.Request, env: Env): Promise<CF.Response> {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/')) {
      try { return await api(request, env); }
      catch (error) {
        if (error instanceof SyntaxError || error instanceof Error && ['Request body required', 'JSON object required', 'Request too large'].includes(error.message)) return fail(error.message, 400);
        return fail('Service unavailable. Please try again.', 503);
      }
    }
    if (path === '/admin/') {
      const session = await accountSession(env, request.headers);
      if (!session?.user.isAdmin) return fail('Administrator access required', 403);
    }
    if (/^\/[a-z][a-z0-9_-]{2,31}(?:\/[a-z0-9_-]{1,80})?$/.test(path)) return CFResponse.redirect(new URL(path + '/', request.url).href, 308);
    if (path === '/' || /^\/[a-z][a-z0-9_-]{2,31}\/(?:[a-z0-9_-]{1,80}\/)?$/.test(path)) {
      const response = await env.ASSETS.fetch(new URL('/index.html', request.url).href);
      return new CFResponse(response.body, { status: response.status, headers: response.headers });
    }
    return env.ASSETS.fetch(request);
  },
};
