import { useState } from 'react';
import { accountRequest } from './accounts';
export function AccountSettings({ initial = false }: { initial?: boolean }) {
  const [current, setCurrent] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  async function change(event: React.FormEvent) {
    event.preventDefault();setError('');setSaved(false);
    if (password !== confirm) { setError('The new passwords do not match');return; }
    setBusy(true);
    try {
      await accountRequest('/api/account/password', { currentPassword: current, newPassword: password });
      if (initial) { location.assign('/admin/');return; }
      setCurrent('');setPassword('');setConfirm('');setSaved(true);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    setBusy(false);
  }
  return <section className="rocket-library"><h1>{initial ? 'Change temporary password' : 'Account settings'}</h1>
    {initial ? <p>Set your own password before using this account.</p> : <h2>Change password</h2>}
    <form className="new-rocket" onSubmit={change}>
      <label htmlFor="current-password">Current password</label><input id="current-password" autoFocus autoComplete="current-password" type="password" required disabled={busy} value={current} onChange={event => setCurrent(event.target.value)}/>
      <label htmlFor="new-password">New password</label><input id="new-password" autoComplete="new-password" type="password" required minLength={8} maxLength={128} disabled={busy} value={password} onChange={event => setPassword(event.target.value)}/>
      <label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" autoComplete="new-password" type="password" required minLength={8} maxLength={128} disabled={busy} value={confirm} onChange={event => setConfirm(event.target.value)}/>
      {error && <p role="alert" className="error">{error}</p>}{saved && <p role="status">Password changed. Your other sessions have been signed out.</p>}
      <button disabled={busy}>{busy ? 'Changing…' : 'Change password'}</button>
    </form>
  </section>;
}
