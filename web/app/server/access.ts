import type * as CF from '@cloudflare/workers-types';
import { authentication } from './auth';
import type { Env } from './env';
import type { AccountUser } from '../src/accounts';
export async function accountSession(env: Env, headers: CF.Headers) {
  const session = await authentication(env).api.getSession({ headers: headers as unknown as Headers });
  if (!session) return null;
  const row = await env.DB.prepare('SELECT user.id, user.username, app_admin.user_id AS adminId, app_admin.must_change_password AS mustChangePassword FROM user LEFT JOIN app_admin ON app_admin.user_id=user.id WHERE user.id=? AND user.deleting=0').bind(session.user.id)
    .first<{ id: string; username: string; adminId: string | null; mustChangePassword: number | null }>();
  if (!row) return null;
  const user: AccountUser = { id: row.id, username: row.username, isAdmin: !!row.adminId, mustChangePassword: row.mustChangePassword === 1 };
  return { session: session.session, user };
}
