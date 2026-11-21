import { useEffect, useRef, useState } from 'react';
import { accountRequest } from './accounts';

export function ResetUserPassword({ user, close, reset }: { user: { id: string; username: string }; close: () => void; reset: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();setError('');
    if (password !== confirm) { setError('The temporary passwords do not match');return; }
    setBusy(true);
    try {
      await accountRequest(`/api/admin/users/${user.id}/password`, { temporaryPassword: password });
      setPassword('');setConfirm('');await reset();close();
    } catch (error) { setError(error instanceof Error ? error.message : String(error));setBusy(false); }
  }
  return <dialog ref={dialog} className="join-dialog" aria-labelledby="reset-password-title" onCancel={event => { event.preventDefault();if (!busy) close(); }}>
    <h2 id="reset-password-title">Reset password</h2><p>Set a temporary password for {user.username}. This signs them out of all sessions. They must choose a different password after signing in.</p>
    <p>Give the temporary password to the user yourself; the app does not send it.</p>
    <form onSubmit={save}>
      <label htmlFor="temporary-password">Temporary password</label><input id="temporary-password" type="password" autoFocus autoComplete="new-password" required minLength={8} maxLength={128} disabled={busy} value={password} onChange={event => setPassword(event.target.value)}/>
      <label htmlFor="confirm-temporary-password">Confirm temporary password</label><input id="confirm-temporary-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={busy} value={confirm} onChange={event => setConfirm(event.target.value)}/>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="window-footer"><button type="button" disabled={busy} onClick={close}>Cancel</button><button disabled={busy}>{busy ? 'Resetting…' : 'Set temporary password'}</button></div>
    </form>
  </dialog>;
}
