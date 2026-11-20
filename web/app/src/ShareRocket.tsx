import { useEffect, useRef, useState } from 'react';
import { accountRequest, rocketPath, type PublicRocket, type RocketSharing } from './accounts';
import { ConfirmAction } from './ConfirmAction';

export function ShareRocket({ rocket, close, changed }: { rocket: PublicRocket; close: () => void; changed: (rocket: PublicRocket) => void | Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [sharing, setSharing] = useState<RocketSharing>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [username, setUsername] = useState(''), [role, setRole] = useState<'viewer' | 'editor'>('viewer'), [canDownload, setCanDownload] = useState(false);
  const [newOwner, setNewOwner] = useState(''), [confirmTransfer, setConfirmTransfer] = useState(false);
  const endpoint = `/api/rockets${rocketPath(rocket).slice(0, -1)}/sharing?rocketId=${rocket.id}`;
  useEffect(() => {
    dialog.current?.showModal();
    void accountRequest<RocketSharing>(endpoint).then(setSharing).catch(error => setError(error instanceof Error ? error.message : String(error)));
  }, []);
  async function update(operation: object, preview?: RocketSharing) {
    setBusy(true);setError('');
    if (preview) setSharing(preview);
    try {
      const result = await accountRequest<RocketSharing>(endpoint, { rocketId: rocket.id, expectedVersion: sharing!.rocket.sharingVersion, ...operation });
      setSharing(result);await changed(result.rocket);return true;
    } catch (error) { setSharing(sharing);setError(error instanceof Error ? error.message : String(error));return false; }
    finally { setBusy(false); }
  }
  return <><dialog ref={dialog} className="join-dialog sharing-dialog" aria-labelledby="sharing-title" onCancel={event => { event.preventDefault();if (!busy) close(); }}>
    <h2 id="sharing-title">Share rocket</h2>
    <p>Share “{rocket.name}”. Owner: {sharing?.rocket.username ?? rocket.username}.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {!sharing ? <p role="status">Loading sharing…</p> : <fieldset disabled={busy}>
      <label htmlFor="rocket-visibility">Who can view</label>
      <select id="rocket-visibility" value={sharing.rocket.visibility} onChange={event => void update({ operation: 'visibility', visibility: event.target.value, publicDownload: sharing.rocket.publicDownload === 1 }, { ...sharing, rocket: { ...sharing.rocket, visibility: event.target.value as PublicRocket['visibility'] } })}>
        <option value="restricted">Restricted — selected users only</option><option value="public">Public — anyone can view</option>
      </select>
      <label className="sharing-check"><input type="checkbox" disabled={sharing.rocket.visibility !== 'public'} checked={sharing.rocket.publicDownload === 1} onChange={event => void update({ operation: 'visibility', visibility: sharing.rocket.visibility, publicDownload: event.target.checked }, { ...sharing, rocket: { ...sharing.rocket, publicDownload: Number(event.target.checked) } })}/>Allow public downloads</label>
      <p>Public access permits viewing only. Selected users have the role and download permission listed below. Removing a user from a public rocket leaves public viewing access.</p>
      <h3>Selected users</h3>
      <ul className="sharing-members">{sharing.members.map(member => <li key={member.username}>
        <strong>{member.username}</strong>
        <label>Role for {member.username}<select aria-label={`Role for ${member.username}`} value={member.role} onChange={event => void update({ operation: 'member', username: member.username, role: event.target.value, canDownload: member.canDownload }, { ...sharing, members: sharing.members.map(row => row.username === member.username ? { ...row, role: event.target.value as 'viewer' | 'editor' } : row) })}><option value="viewer">Viewer</option><option value="editor">Editor</option></select></label>
        <label className="sharing-check"><input type="checkbox" aria-label={`Allow downloads for ${member.username}`} checked={member.canDownload} onChange={event => void update({ operation: 'member', username: member.username, role: member.role, canDownload: event.target.checked }, { ...sharing, members: sharing.members.map(row => row.username === member.username ? { ...row, canDownload: event.target.checked } : row) })}/>Downloads</label>
        <button type="button" onClick={() => void update({ operation: 'remove', username: member.username })}>Remove {member.username}</button>
      </li>)}</ul>
      {!sharing.members.length && <p>No selected users.</p>}
      <form onSubmit={event => { event.preventDefault();void update({ operation: 'member', username, role, canDownload }).then(ok => { if (ok) setUsername(''); }); }}>
        <label htmlFor="share-username">Username to share with</label><input id="share-username" required maxLength={32} value={username} onChange={event => setUsername(event.target.value)}/>
        <label htmlFor="share-role">Access role</label><select id="share-role" value={role} onChange={event => setRole(event.target.value as 'viewer' | 'editor')}><option value="viewer">Viewer</option><option value="editor">Editor</option></select>
        <label className="sharing-check"><input type="checkbox" checked={canDownload} onChange={event => setCanDownload(event.target.checked)}/>Allow downloads for this user</label>
        <button type="submit">Add or update user</button>
      </form>
      <p>Viewers can inspect and run simulations. Editors can change the design, simulation settings and replace the file. Only the owner and administrator manage sharing, rename or delete rockets. The administrator retains full access.</p>
      <p>Download settings control the app’s .ork export. They cannot prevent copying data already received by a browser or retrieve earlier downloads.</p>
      <form onSubmit={event => { event.preventDefault();setConfirmTransfer(true); }}>
        <h3>Transfer ownership</h3><label htmlFor="new-owner">New owner username</label><input id="new-owner" required maxLength={32} value={newOwner} onChange={event => setNewOwner(event.target.value)}/>
        <button type="submit">Transfer ownership…</button>
      </form>
    </fieldset>}
    <div className="window-footer"><button autoFocus disabled={busy} onClick={close}>Close</button></div>
  </dialog>
  {confirmTransfer && <ConfirmAction title="Transfer ownership" confirm="Transfer ownership" close={() => setConfirmTransfer(false)} action={async () => {
    if (!await update({ operation: 'transfer', username: newOwner })) throw new Error('Transfer failed. Close this confirmation to see the error.');
    close();
  }}><p>Transfer “{rocket.name}” to {newOwner}?</p><p>The new owner will control sharing, renaming and deletion. The previous owner keeps Editor access with downloads allowed. The share URL stays the same. Only the current owner can transfer ownership.</p></ConfirmAction>}
  </>;
}
