import type * as CF from '@cloudflare/workers-types';
import type { Env } from './env';
import { accountSession } from './access';
import { body, fail, json } from './http';
import { defaultPreferences, validPreferences } from '../src/preferences';

export async function preferencesApi(request: CF.Request, env: Env) {
  if (!['GET', 'POST'].includes(request.method)) return fail('Not found', 404);
  if (request.method === 'POST' && request.headers.get('Origin') !== new URL(env.AUTH_BASE_URL).origin) return fail('Origin refused', 403);
  const session = await accountSession(env, request.headers);
  if (!session) return fail('Sign in to change preferences', 401);
  if (session.user.mustChangePassword) return fail('Change your temporary password first', 403);
  if (request.method === 'GET') {
    const saved = await env.DB.prepare('SELECT version, settings FROM user_preferences WHERE user_id=?').bind(session.user.id).first<{ version: number; settings: string }>();
    return json({ version: saved?.version ?? 0, preferences: saved ? JSON.parse(saved.settings) : defaultPreferences() });
  }
  const data = await body(request);
  if (!Number.isSafeInteger(data.expectedVersion) || data.expectedVersion < 0 || !validPreferences(data.preferences)) return fail('Invalid preferences', 400);
  // A conditional upsert fences concurrent tabs and account deletion in one D1 statement.
  const changed = await env.DB.prepare('INSERT INTO user_preferences(user_id, version, settings) SELECT id, 1, ? FROM user WHERE id=? AND deleting=0 AND EXISTS (SELECT 1 FROM session WHERE session.id=? AND session.user_id=user.id AND session.expires_at>?) AND (?=0 OR EXISTS (SELECT 1 FROM user_preferences WHERE user_id=user.id AND version=?)) ON CONFLICT(user_id) DO UPDATE SET version=user_preferences.version+1, settings=excluded.settings WHERE user_preferences.version=?')
    .bind(JSON.stringify(data.preferences), session.user.id, session.session.id, Date.now(), data.expectedVersion, data.expectedVersion, data.expectedVersion).run();
  if (!changed.meta.changes) return fail('Preferences changed in another tab. Reload before saving again.', 409);
  return json({ version: data.expectedVersion + 1, preferences: data.preferences });
}
