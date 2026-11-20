import type * as CF from '@cloudflare/workers-types';
import type { Env } from './env';
import { authentication } from './auth';
import { accountSession } from './access';
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
    const data = await body(request);
    if (typeof data.currentPassword !== 'string' || typeof data.newPassword !== 'string') return fail('Current and new passwords are required', 400);
    const changed = await authentication(env).api.changePassword({ headers: request.headers as unknown as Headers,
      body: { currentPassword: data.currentPassword, newPassword: data.newPassword, revokeOtherSessions: true }, asResponse: true });
    if (!changed.ok) return changed as unknown as CF.Response;
    const result = await changed.clone().json() as { token: string };
    if (!result.token) return fail('Password changed; sign in again to complete setup', 503);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM session WHERE user_id=? AND token<>?').bind(session.user.id, result.token),
      env.DB.prepare('UPDATE app_admin SET must_change_password=0, credential_version=credential_version+1 WHERE user_id=?').bind(session.user.id),
    ]);
    return changed as unknown as CF.Response;
  }
  if (session.user.mustChangePassword) return fail('Change your temporary password before using admin tools', 403);
  if (path === '/api/admin/users' && request.method === 'GET') {
    const result = await env.DB.prepare('SELECT user.id, user.username, user.email, user.created_at AS createdAt, user.deleting, COUNT(rocket.id) AS rocketCount, app_admin.user_id AS adminId FROM user LEFT JOIN rocket ON rocket.owner_id=user.id LEFT JOIN app_admin ON app_admin.user_id=user.id GROUP BY user.id ORDER BY user.username').all();
    return json({ users: result.results });
  }
  if (path === '/api/admin/rockets' && request.method === 'GET') {
    const result = await env.DB.prepare('SELECT rocket.id, rocket.name, rocket.slug, rocket.owner_id AS ownerId, rocket.deleted_at AS deletedAt, user.username FROM rocket JOIN user ON user.id=rocket.owner_id ORDER BY rocket.created_at DESC, rocket.id').all();
    return json({ rockets: result.results });
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
