import { useEffect, useState } from 'react';
import { accountRequest, rocketPath, type PublicRocket } from './accounts';
import { ConfirmAction } from './ConfirmAction';
interface ManagedUser { id: string; username: string; email: string; createdAt: number; deleting: number; rocketCount: number; adminId: string | null }
export function PasswordSetup() {
  const [current, setCurrent] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function change(event: React.FormEvent) {
    event.preventDefault();setError('');
    if (password !== confirm) { setError('The new passwords do not match');return; }
    setBusy(true);
    try { await accountRequest('/api/admin/password', { currentPassword: current, newPassword: password });location.assign('/admin/'); }
    catch (error) { setError(error instanceof Error ? error.message : String(error));setBusy(false); }
  }
  return <section className="rocket-library"><h1>Change temporary password</h1><p>Set your own password before using this account.</p>
    <form className="new-rocket" onSubmit={change}>
      <label htmlFor="current-password">Current password</label><input id="current-password" autoFocus autoComplete="current-password" type="password" required disabled={busy} value={current} onChange={event => setCurrent(event.target.value)}/>
      <label htmlFor="new-password">New password</label><input id="new-password" autoComplete="new-password" type="password" required minLength={8} maxLength={128} disabled={busy} value={password} onChange={event => setPassword(event.target.value)}/>
      <label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" autoComplete="new-password" type="password" required minLength={8} maxLength={128} disabled={busy} value={confirm} onChange={event => setConfirm(event.target.value)}/>
      {error && <p role="alert" className="error">{error}</p>}<button disabled={busy}>{busy ? 'Changing…' : 'Change password'}</button>
    </form>
  </section>;
}
export function AdminPanel() {
  const [users, setUsers] = useState<ManagedUser[]>([]), [rockets, setRockets] = useState<(PublicRocket & { deletedAt?: number })[]>([]), [error, setError] = useState('');
  const [pending, setPending] = useState<{ kind: 'user' | 'rocket' | 'sessions'; user?: ManagedUser; rocket?: PublicRocket }>();
  async function load() {
    const [accounts, documents] = await Promise.all([accountRequest<{ users: ManagedUser[] }>('/api/admin/users'), accountRequest<{ rockets: PublicRocket[] }>('/api/admin/rockets')]);
    setUsers(accounts.users);setRockets(documents.rockets);
  }
  useEffect(() => { void load().catch(error => setError(error instanceof Error ? error.message : String(error))); }, []);
  async function perform() {
    if (!pending) return;
    await accountRequest(pending.rocket ? `/api/rockets/${pending.rocket.username}/${pending.rocket.slug}?rocketId=${pending.rocket.id}` : `/api/admin/users/${pending.user!.id}${pending.kind === 'sessions' ? '/sessions' : ''}`, undefined, 'DELETE');
    await load();
  }
  return <section className="rocket-library admin-panel"><h1>Admin panel</h1><p>Manage accounts and public rockets.</p>
    {error && <p role="alert" className="error">{error}</p>}
    <h2>Users</h2><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Username</th><th>Email</th><th>Rockets</th><th>Actions</th></tr></thead><tbody>{users.map(user => <tr key={user.id} data-user-id={user.id}>
      <td>{user.username}{user.adminId ? ' · Administrator' : user.deleting ? ' · Deletion pending' : ''}</td><td>{user.email}</td><td>{user.rocketCount}</td><td>{user.adminId ? <span>Protected account</span> : <div className="management-actions">
        <button onClick={() => setPending({ kind: 'sessions', user })}>Revoke sessions</button><button className="danger-button" onClick={() => setPending({ kind: 'user', user })}>Delete user</button>
      </div>}</td></tr>)}</tbody></table></div>
    <h2>Rockets</h2><div className="rocket-list">{rockets.map(rocket => <article key={rocket.id}>
      <a href={rocketPath(rocket)}><strong>{rocket.name}</strong><span>by {rocket.username}{rocket.deletedAt ? ' · Deletion pending' : ''}</span></a>
      <button className="danger-button" onClick={() => setPending({ kind: 'rocket', rocket })}>Delete rocket</button>
    </article>)}</div>{!rockets.length && <p>No rockets.</p>}
    {pending && <ConfirmAction title={pending.kind === 'rocket' ? 'Delete rocket' : pending.kind === 'user' ? 'Delete user' : 'Revoke sessions'} confirm={pending.kind === 'rocket' ? 'Delete rocket' : pending.kind === 'user' ? 'Delete user' : 'Revoke sessions'} close={() => setPending(undefined)} action={perform}>
      <p>{pending.rocket ? `Are you sure you want to permanently delete “${pending.rocket.name}”?` : pending.kind === 'user' ? `Are you sure you want to permanently delete ${pending.user!.username} and all ${pending.user!.rocketCount} of their rockets?` : `Are you sure you want to sign ${pending.user!.username} out of all sessions?`}</p>
      <p>{pending.kind === 'sessions' ? 'They can sign in again with their password.' : 'This cannot be undone. Connected editors will lose access.'}</p>
    </ConfirmAction>}
  </section>;
}
