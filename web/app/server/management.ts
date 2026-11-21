import type * as CF from '@cloudflare/workers-types';
import type { Env } from './env';
import { accountSession, changePassword } from './access';
import { authentication } from './auth';
import { body, fail, json } from './http';
export function deleteRocket(env: Env, id: string, headers: CF.Headers) {
  const forwarded = new Headers(headers as unknown as Headers);forwarded.set('X-Rocket-Id', id);
  return env.SHARED_ROCKET.getByName(`rocket:${id}`).fetch(new Request('https://room.internal/delete-rocket', { method: 'POST', headers: forwarded }) as unknown as CF.Request);
}
export async function adminApi(request: CF.Request, env: Env): Promise<CF.Response> {
  const session = await accountSession(env, request.headers);
  if (!session) return fail('Sign in as the administrator', 401);
  if (!session.user.isAdmin) return fail('Administrator access required', 403);
  const path = new URL(request.url).pathname;
  if (request.method !== 'GET' && request.headers.get('Origin') !== new URL(env.AUTH_BASE_URL).origin) return fail('Origin refused', 403);
  if (path === '/api/admin/password' && request.method === 'POST') {
    return changePassword(request, env);
  }
  if (session.user.mustChangePassword) return fail('Change your temporary password before using admin tools', 403);
  if (path === '/api/admin/users' && request.method === 'GET') {
    const result = await env.DB.prepare('SELECT user.id, user.username, user.email, user.created_at AS createdAt, user.deleting, user.must_change_password AS mustChangePassword, COUNT(rocket.id) AS rocketCount, app_admin.user_id AS adminId FROM user LEFT JOIN rocket ON rocket.owner_id=user.id LEFT JOIN app_admin ON app_admin.user_id=user.id GROUP BY user.id ORDER BY user.username').all();
    return json({ users: result.results });
  }
  if (path === '/api/admin/rockets' && request.method === 'GET') {
    const result = await env.DB.prepare('SELECT rocket.id, rocket.name, rocket.slug, rocket.owner_id AS ownerId, rocket.route_username AS routeUsername, rocket.visibility, rocket.deleted_at AS deletedAt, user.username FROM rocket JOIN user ON user.id=rocket.owner_id ORDER BY rocket.created_at DESC, rocket.id').all();
    return json({ rockets: result.results });
  }
  const reset = /^\/api\/admin\/users\/([^/]+)\/password$/.exec(path);
  if (reset && request.method === 'POST') {
    const user = await env.DB.prepare('SELECT user.id, user.deleting, app_admin.user_id AS adminId FROM user LEFT JOIN app_admin ON app_admin.user_id=user.id WHERE user.id=?').bind(reset[1]).first<{ id: string; deleting: number; adminId: string | null }>();
    if (!user) return fail('User not found', 404);
    if (user.adminId) return fail('Use Account settings to change the administrator password', 403);
    if (user.deleting) return fail('User deletion is pending', 409);
    const data = await body(request), { password } = await authentication(env).$context;
    if (typeof data.temporaryPassword !== 'string' || data.temporaryPassword.length < password.config.minPasswordLength || data.temporaryPassword.length > password.config.maxPasswordLength) return fail(`Use a temporary password of ${password.config.minPasswordLength}–${password.config.maxPasswordLength} characters`, 400);
    const credential = await env.DB.prepare("SELECT password FROM account WHERE user_id=? AND provider_id='credential'").bind(user.id).first<{ password: string }>();
    if (!credential) return fail('Password account unavailable', 409);
    const hash = await password.hash(data.temporaryPassword);
    // The credential, required change and session revocation become visible together.
    const changed = await env.DB.batch([
      env.DB.prepare("UPDATE account SET password=?, updated_at=? WHERE user_id=? AND provider_id='credential' AND password=? AND EXISTS (SELECT 1 FROM user WHERE user.id=account.user_id AND deleting=0 AND NOT EXISTS (SELECT 1 FROM app_admin WHERE user_id=user.id)) AND EXISTS (SELECT 1 FROM session JOIN app_admin ON app_admin.user_id=session.user_id JOIN user ON user.id=session.user_id WHERE session.id=? AND session.expires_at>? AND user.deleting=0 AND user.must_change_password=0)").bind(hash, Date.now(), user.id, credential.password, session.session.id, Date.now()),
      env.DB.prepare("UPDATE user SET must_change_password=1 WHERE id=? AND EXISTS (SELECT 1 FROM account WHERE user_id=user.id AND provider_id='credential' AND password=?)").bind(user.id, hash),
      env.DB.prepare("DELETE FROM session WHERE user_id=? AND EXISTS (SELECT 1 FROM account WHERE user_id=session.user_id AND provider_id='credential' AND password=?)").bind(user.id, hash),
    ]);
    if (!changed[0].meta.changes) return fail('Account or session changed. Reload and retry.', 409);
    return json({ reset: true });
  }
  const target = /^\/api\/admin\/users\/([^/]+)(\/sessions)?$/.exec(path);
  if (target && request.method === 'DELETE') {
    const user = await env.DB.prepare('SELECT user.id, app_admin.user_id AS adminId FROM user LEFT JOIN app_admin ON app_admin.user_id=user.id WHERE user.id=?').bind(target[1]).first<{ id: string; adminId: string | null }>();
    if (!user) return fail('User not found', 404);
    if (user.adminId) return fail('The administrator account is protected', 403);
    if (target[2]) { await env.DB.prepare('DELETE FROM session WHERE user_id=?').bind(user.id).run();return json({ revoked: true }); }
    await env.DB.batch([
      env.DB.prepare('UPDATE user SET deleting=1 WHERE id=?').bind(user.id),
      env.DB.prepare('DELETE FROM session WHERE user_id=?').bind(user.id),
    ]);
    const rockets = await env.DB.prepare('SELECT id FROM rocket WHERE owner_id=?').bind(user.id).all<{ id: string }>();
    for (const rocket of rockets.results) {
      const removed = await deleteRocket(env, rocket.id, request.headers);
      if (!removed.ok && removed.status !== 404) return removed;
    }
    const removed = await env.DB.prepare('DELETE FROM user WHERE id=? AND NOT EXISTS (SELECT 1 FROM rocket WHERE owner_id=?)').bind(user.id, user.id).run();
    if (!removed.meta.changes) return fail('User deletion is incomplete. Retry deleting this user.', 503);
    return json({ deleted: true });
  }
  return fail('Not found', 404);
}
