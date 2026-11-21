import type * as CF from '@cloudflare/workers-types';
import { authentication } from './auth';
import type { Env } from './env';
import type { AccountUser } from '../src/accounts';
import { body, fail, json } from './http';
export async function accountSession(env: Env, headers: CF.Headers) {
  const session = await authentication(env).api.getSession({ headers: headers as unknown as Headers });
  if (!session) return null;
  const row = await env.DB.prepare('SELECT user.id, user.username, app_admin.user_id AS adminId, user.must_change_password AS mustChangePassword FROM user LEFT JOIN app_admin ON app_admin.user_id=user.id WHERE user.id=? AND user.deleting=0').bind(session.user.id)
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
  const { password } = await authentication(env).$context;
  if (data.newPassword.length < password.config.minPasswordLength || data.newPassword.length > password.config.maxPasswordLength || data.currentPassword.length > password.config.maxPasswordLength) return fail(`Use a password of ${password.config.minPasswordLength}–${password.config.maxPasswordLength} characters`, 400);
  const credential = await env.DB.prepare("SELECT password FROM account WHERE user_id=? AND provider_id='credential'").bind(session.user.id).first<{ password: string }>();
  if (!credential || !await password.verify({ hash: credential.password, password: data.currentPassword })) return fail('Current password is incorrect', 400);
  if (await password.verify({ hash: credential.password, password: data.newPassword })) return fail('Choose a different password', 400);
  const hash = await password.hash(data.newPassword);
  // Compare the credential and live session inside the same batch as flag clearing/revocation.
  // A reset during hashing must not be overwritten by this password change.
  const changed = await env.DB.batch([
    env.DB.prepare("UPDATE account SET password=?, updated_at=? WHERE user_id=? AND provider_id='credential' AND password=? AND EXISTS (SELECT 1 FROM session JOIN user ON user.id=session.user_id WHERE session.id=? AND session.user_id=account.user_id AND session.expires_at>? AND user.deleting=0)").bind(hash, Date.now(), session.user.id, credential.password, session.session.id, Date.now()),
    env.DB.prepare("UPDATE user SET must_change_password=0 WHERE id=? AND EXISTS (SELECT 1 FROM account WHERE user_id=user.id AND provider_id='credential' AND password=?)").bind(session.user.id, hash),
    env.DB.prepare("DELETE FROM session WHERE user_id=? AND id<>? AND EXISTS (SELECT 1 FROM account WHERE user_id=session.user_id AND provider_id='credential' AND password=?)").bind(session.user.id, session.session.id, hash),
    env.DB.prepare("UPDATE app_admin SET must_change_password=0, credential_version=credential_version+1 WHERE user_id=? AND EXISTS (SELECT 1 FROM account WHERE user_id=app_admin.user_id AND provider_id='credential' AND password=?)").bind(session.user.id, hash),
  ]);
  if (!changed[0].meta.changes) return fail('Password or session changed. Sign in again and retry.', 409);
  return json({ changed: true });
}
