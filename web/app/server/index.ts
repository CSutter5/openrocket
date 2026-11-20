import type * as CF from '@cloudflare/workers-types';
import { authentication, validUsername } from './auth';
import type { Env } from './env';
import type { PublicRocket as Rocket } from '../src/accounts';
export { SharedRocket } from './room';
const CFResponse = Response as unknown as typeof CF.Response;
const json = (data: unknown, status = 200) => CFResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (message: string, status: number) => json({ error: message }, status);
const authPaths = new Set(['/sign-up/email', '/sign-in/username', '/get-session', '/sign-out']);
const slugPattern = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const rocketQuery = 'SELECT rocket.id, rocket.name, rocket.slug, rocket.owner_id AS ownerId, user.username FROM rocket JOIN user ON rocket.owner_id=user.id';
async function body(request: CF.Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('JSON body required');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > 16384) { await reader.cancel();throw new Error('Request too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset);offset += chunk.length; }
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON object required');
  return value;
}
async function api(request: CF.Request, env: Env): Promise<CF.Response> {
  const url = new URL(request.url), path = url.pathname;
  if (path === '/api/coedit') return json({ enabled: true, accounts: true });
  if (path.startsWith('/api/auth/')) {
    const route = path.slice('/api/auth'.length);
    if (!authPaths.has(route)) return fail('Account operation unavailable', 404);
    if (request.method === 'POST') {
      if (request.headers.get('Origin') !== new URL(env.AUTH_BASE_URL).origin) return fail('Origin refused', 403);
      const data = await body(request.clone());
      if (route === '/sign-up/email' && (typeof data.username !== 'string' || !validUsername(data.username.toLowerCase()))) return fail('Use a username of 3–32 letters, digits, hyphens or underscores, starting with a letter', 400);
    }
    return authentication(env).handler(request as unknown as Request) as unknown as Promise<CF.Response>;
  }
  if (path === '/api/session') {
    const session = await authentication(env).api.getSession({ headers: request.headers as unknown as Headers });
    return json({ user: session ? { id: session.user.id, username: session.user.username } : null });
  }
  if (path === '/api/rockets' && request.method === 'GET') {
    const owner = url.searchParams.get('owner');
    const query = env.DB.prepare(rocketQuery + (owner ? ' WHERE user.username=?' : '') + ' ORDER BY rocket.created_at DESC, rocket.id');
    const rockets = await (owner ? query.bind(owner) : query).all<Rocket>();
    return json({ rockets: rockets.results });
  }
  if (path === '/api/rockets' && request.method === 'POST') {
    if (request.headers.get('Origin') !== new URL(env.AUTH_BASE_URL).origin) return fail('Origin refused', 403);
    const session = await authentication(env).api.getSession({ headers: request.headers as unknown as Headers });
    if (!session) return fail('Sign in to create a rocket', 401);
    const data = await body(request);
    if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 100 || /[\x00-\x1f\x7f]/.test(data.name)) return fail('Enter a rocket name of 1–100 characters', 400);
    if (typeof data.slug !== 'string' || data.slug.length > 80 || !slugPattern.test(data.slug)) return fail('Use a URL name of lowercase letters, digits, hyphens or underscores', 400);
    const rocket: Rocket = { id: crypto.randomUUID(), name: data.name.trim(), slug: data.slug, ownerId: session.user.id, username: session.user.username! };
    try { await env.DB.prepare('INSERT INTO rocket(id, owner_id, name, slug, created_at) VALUES (?, ?, ?, ?, ?)').bind(rocket.id, rocket.ownerId, rocket.name, rocket.slug, Date.now()).run(); }
    catch (error) {
      if (await env.DB.prepare('SELECT id FROM rocket WHERE owner_id=? AND slug=?').bind(rocket.ownerId, rocket.slug).first()) return fail('You already have a rocket at that URL', 409);
      throw error;
    }
    return json({ rocket }, 201);
  }
  const match = /^\/api\/rockets\/([a-z][a-z0-9_-]{2,31})\/([a-z0-9_-]{1,80})(\/socket)?$/.exec(path);
  if (match) {
    const rocket = await env.DB.prepare(rocketQuery + ' WHERE user.username=? AND rocket.slug=?').bind(match[1], match[2]).first<Rocket>();
    if (!rocket) return fail('Rocket not found', 404);
    if (match[3]) {
      if (request.headers.get('Origin') !== new URL(env.AUTH_BASE_URL).origin) return fail('Origin refused', 403);
      const forwarded = new Request(request.url, request as unknown as Request);
      forwarded.headers.set('X-Rocket-Id', rocket.id);
      return env.SHARED_ROCKET.getByName(`rocket:${rocket.id}`).fetch(forwarded as unknown as CF.Request);
    }
    if (request.method === 'GET') return json({ rocket });
  }
  return fail('Not found', 404);
}
export default {
  async fetch(request: CF.Request, env: Env): Promise<CF.Response> {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/')) {
      try { return await api(request, env); }
      catch (error) {
        if (error instanceof SyntaxError || error instanceof Error && ['JSON body required', 'JSON object required', 'Request too large'].includes(error.message)) return fail(error.message, 400);
        return fail('Service unavailable. Please try again.', 503);
      }
    }
    if (/^\/[a-z][a-z0-9_-]{2,31}(?:\/[a-z0-9_-]{1,80})?$/.test(path)) return CFResponse.redirect(new URL(path + '/', request.url).href, 308);
    if (path === '/' || /^\/[a-z][a-z0-9_-]{2,31}\/(?:[a-z0-9_-]{1,80}\/)?$/.test(path)) {
      const response = await env.ASSETS.fetch(new URL('/index.html', request.url).href);
      return new CFResponse(response.body, { status: response.status, headers: response.headers });
    }
    return env.ASSETS.fetch(request);
  },
};
