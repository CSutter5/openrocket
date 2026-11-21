import type * as CF from '@cloudflare/workers-types';
import type { Env, SocketIdentity } from './env';
import type { AccountUser, PublicRocket, RocketAccess, RocketMember } from '../src/accounts';
import { accountSession } from './access';
import { body, fail, json } from './http';

export const rocketQuery = 'SELECT rocket.id, rocket.name, rocket.slug, rocket.owner_id AS ownerId, user.username, rocket.route_username AS routeUsername, rocket.visibility, rocket.public_download AS publicDownload, rocket.sharing_version AS sharingVersion FROM rocket JOIN user ON rocket.owner_id=user.id';
export async function rocketAccess(env: Env, id: string, actor: AccountUser | null): Promise<RocketAccess> {
  const row = await env.DB.prepare('SELECT rocket.owner_id AS ownerId, rocket.visibility, rocket.public_download AS publicDownload, rocket_member.role, rocket_member.can_download AS memberDownload FROM rocket JOIN user ON user.id=rocket.owner_id LEFT JOIN rocket_member ON rocket_member.rocket_id=rocket.id AND rocket_member.user_id=? WHERE rocket.id=? AND rocket.deleted_at IS NULL AND user.deleting=0')
    .bind(actor?.id ?? '', id).first<{ ownerId: string; visibility: string; publicDownload: number; role: string | null; memberDownload: number | null }>();
  const canManage = !!row && !!actor && !actor.mustChangePassword && (row.ownerId === actor.id || actor.isAdmin);
  const canView = !!row && (row.visibility === 'public' || canManage || !!row.role);
  return { canView, canManage, canEdit: canView && (canManage || !!actor && !actor.mustChangePassword && row?.role === 'editor'),
    canDownload: canView && (canManage || (row?.role ? row.memberDownload === 1 : row?.visibility === 'public' && row.publicDownload === 1)) };
}
export async function socketAccess(env: Env, identity: SocketIdentity) {
  const actor = identity.sessionId ? await env.DB.prepare('SELECT user.id, user.username, app_admin.user_id AS adminId, user.must_change_password AS mustChangePassword FROM session JOIN user ON user.id=session.user_id LEFT JOIN app_admin ON app_admin.user_id=user.id WHERE session.id=? AND session.user_id=? AND session.expires_at>? AND user.deleting=0')
    .bind(identity.sessionId, identity.userId, Date.now()).first<{ id: string; username: string; adminId: string | null; mustChangePassword: number }>() : null;
  return rocketAccess(env, identity.rocketId, actor ? { ...actor, isAdmin: !!actor.adminId, mustChangePassword: actor.mustChangePassword === 1 } : null);
}
export async function sharingState(env: Env, id: string) {
  const rocket = await env.DB.prepare(rocketQuery + ' WHERE rocket.id=? AND rocket.deleted_at IS NULL AND user.deleting=0').bind(id).first<PublicRocket>();
  const members = await env.DB.prepare('SELECT user.username, rocket_member.role, rocket_member.can_download AS canDownload FROM rocket_member JOIN user ON user.id=rocket_member.user_id WHERE rocket_id=? AND user.deleting=0 ORDER BY user.username').bind(id).all<Omit<RocketMember, 'canDownload'> & { canDownload: number }>();
  return { rocket, members: members.results.map(member => ({ ...member, canDownload: member.canDownload === 1 })) };
}

// Called inside the rocket's serialized command queue, including ownership changes.
export async function manageSharing(request: CF.Request, env: Env, id: string) {
  const session = await accountSession(env, request.headers);
  if (!session) return fail('Sign in to manage sharing', 401);
  const access = await rocketAccess(env, id, session.user);
  if (!access.canManage) return fail('Only the owner or administrator can manage sharing', 403);
  if (request.method === 'GET') return json(await sharingState(env, id));
  const data = await body(request), current = await sharingState(env, id), rocket = current.rocket!;
  if (data.rocketId !== id || data.expectedVersion !== rocket.sharingVersion) return fail('Sharing changed. Reopen sharing and try again.', 409);
  const statements: CF.D1PreparedStatement[] = [];
  if (data.operation === 'visibility') {
    if (!['public', 'restricted'].includes(data.visibility) || typeof data.publicDownload !== 'boolean') return fail('Choose visibility and download permissions', 400);
    statements.push(env.DB.prepare('UPDATE rocket SET visibility=?, public_download=? WHERE id=?').bind(data.visibility, Number(data.publicDownload), id));
  } else if (['member', 'remove', 'transfer'].includes(data.operation)) {
    if (typeof data.username !== 'string' || data.username.length > 32) return fail('Enter an existing username', 400);
    const target = await env.DB.prepare('SELECT user.id, user.must_change_password AS mustChangePassword FROM user WHERE user.username=? AND user.deleting=0').bind(data.username.trim().toLowerCase()).first<{ id: string; mustChangePassword: number }>();
    if (!target) return fail('User not found', 404);
    if (target.id === rocket.ownerId) return fail('The owner already has full access', 400);
    if (data.operation === 'member') {
      if (!['viewer', 'editor'].includes(data.role) || typeof data.canDownload !== 'boolean') return fail('Choose a role and download permission', 400);
      statements.push(env.DB.prepare('INSERT INTO rocket_member(rocket_id, user_id, role, can_download) VALUES (?, ?, ?, ?) ON CONFLICT(rocket_id, user_id) DO UPDATE SET role=excluded.role, can_download=excluded.can_download').bind(id, target.id, data.role, Number(data.canDownload)));
    } else if (data.operation === 'remove') {
      statements.push(env.DB.prepare('DELETE FROM rocket_member WHERE rocket_id=? AND user_id=?').bind(id, target.id));
    } else {
      if (session.user.id !== rocket.ownerId) return fail('Only the owner can transfer ownership', 403);
      if (target.mustChangePassword) return fail('The new owner must finish account setup first', 400);
      statements.push(env.DB.prepare('UPDATE rocket SET owner_id=? WHERE id=?').bind(target.id, id),
        env.DB.prepare('DELETE FROM rocket_member WHERE rocket_id=? AND user_id=?').bind(id, target.id),
        env.DB.prepare("INSERT INTO rocket_member(rocket_id, user_id, role, can_download) VALUES (?, ?, 'editor', 1) ON CONFLICT(rocket_id, user_id) DO UPDATE SET role='editor', can_download=1").bind(id, rocket.ownerId));
    }
  } else return fail('Unknown sharing operation', 400);
  // D1 batch is atomic. Recheck identities immediately before committing it.
  const fresh = await accountSession(env, request.headers);
  if (!fresh || !(await rocketAccess(env, id, fresh.user)).canManage) return fail('Sharing access changed. Sign in again.', 403);
  statements.push(env.DB.prepare('UPDATE rocket SET sharing_version=sharing_version+1 WHERE id=?').bind(id));
  await env.DB.batch(statements);
  return json(await sharingState(env, id));
}
