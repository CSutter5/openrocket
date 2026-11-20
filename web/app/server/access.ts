import type * as CF from '@cloudflare/workers-types';
import { authentication } from './auth';
import type { Env } from './env';
import type { AccountUser } from '../src/accounts';
import { body, fail } from './http';
export async function accountSession(env: Env, headers: CF.Headers) {
  const session = await authentication(env).api.getSession({ headers: headers as unknown as Headers });
  if (!session) return null;
  const row = await env.DB.prepare('SELECT user.id, user.username, app_admin.user_id AS adminId, app_admin.must_change_password AS mustChangePassword FROM user LEFT JOIN app_admin ON app_admin.user_id=user.id WHERE user.id=? AND user.deleting=0').bind(session.user.id)
    .first<{ id: string; username: string; adminId: string | null; mustChangePassword: number | null }>();
  if (!row) return null;
  const user: AccountUser = { id: row.id, username: row.username, isAdmin: !!row.adminId, mustChangePassword: row.mustChangePassword === 1 };
  return { session: session.session, user };
}
export async function changePassword(request: CF.Request, env: Env) {
  if (request.headers.get('Origin') !== new URL(env.AUTH_BASE_URL).origin) return fail('Origin refused', 403);
  const session = await accountSession(env, request.headers);
  if (!session) return fail('Sign in to change your password', 401);
  const data = await body(request);
  if (typeof data.currentPassword !== 'string' || typeof data.newPassword !== 'string') return fail('Current and new passwords are required', 400);
  const changed = await authentication(env).api.changePassword({ headers: request.headers as unknown as Headers,
    body: { currentPassword: data.currentPassword, newPassword: data.newPassword, revokeOtherSessions: true }, asResponse: true });
  if (!changed.ok) return changed as unknown as CF.Response;
  const result = await changed.clone().json() as { token: string };
  if (!result.token) return fail('Password changed; sign in again', 503);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM session WHERE user_id=? AND token<>?').bind(session.user.id, result.token),
    env.DB.prepare('UPDATE app_admin SET must_change_password=0, credential_version=credential_version+1 WHERE user_id=?').bind(session.user.id),
  ]);
  return changed as unknown as CF.Response;
}
