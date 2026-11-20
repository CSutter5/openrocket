import { useEffect, useRef, useState } from 'react';
import { accountRequest, rocketPath, type PublicRocket } from './accounts';
export function RenameRocket({ rocket, close, renamed }: { rocket: PublicRocket; close: () => void; renamed: (rocket: PublicRocket) => Promise<void> | void }) {
  const dialog = useRef<HTMLDialogElement>(null), [name, setName] = useState(rocket.name), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();setBusy(true);setError('');
    try {
      const result = await accountRequest<{ rocket: PublicRocket }>(`/api/rockets${rocketPath(rocket)}rename`, { rocketId: rocket.id, expectedName: rocket.name, name });
      await renamed(result.rocket);close();
    } catch (error) { setError(error instanceof Error ? error.message : String(error));setBusy(false); }
  }
  return <dialog ref={dialog} className="join-dialog" aria-labelledby="rename-title" onCancel={event => { event.preventDefault();if (!busy) close(); }}>
    <h2 id="rename-title">Rename rocket</h2><form onSubmit={save}>
      <label htmlFor="rename-name">Rocket name</label><input id="rename-name" autoFocus required maxLength={100} disabled={busy} value={name} onChange={event => setName(event.target.value)}/>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="window-footer"><button type="button" disabled={busy} onClick={close}>Cancel</button><button disabled={busy}>{busy ? 'Saving…' : 'Rename rocket'}</button></div>
    </form>
  </dialog>;
}
