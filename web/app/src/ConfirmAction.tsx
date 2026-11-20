import { useEffect, useRef, useState, type ReactNode } from 'react';
export function ConfirmAction({ title, children, confirm, action, close }: { title: string; children: ReactNode; confirm: string; action: () => Promise<void>; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function perform() {
    setBusy(true);setError('');
    try { await action();close(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error));setBusy(false); }
  }
  return <dialog ref={dialog} className="join-dialog" aria-labelledby="confirmation-title" onCancel={event => { event.preventDefault();if (!busy) close(); }}>
    <h2 id="confirmation-title">{title}</h2>{children}
    {error && <p role="alert" className="error">{error}</p>}
    <div className="window-footer"><button autoFocus disabled={busy} onClick={close}>Cancel</button><button className="danger-button" disabled={busy} onClick={() => void perform()}>{busy ? 'Working…' : confirm}</button></div>
  </dialog>;
}
