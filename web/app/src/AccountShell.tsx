import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LIMITS } from '@openrocket/ork-format';
import { accountRequest, rocketPath, type AccountUser, type PublicRocket } from './accounts';
import { ConfirmAction } from './ConfirmAction';
import { AdminPanel } from './AdminPanel';
import { AccountSettings } from './AccountSettings';
import { RenameRocket } from './RenameRocket';
const failure = (error: unknown) => error instanceof Error ? error.message : String(error);
function AccountForm({ signup, close }: { signup: boolean; close: () => void }) {
  const [username, setUsername] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);setError('');
    try {
      await accountRequest(`/api/auth/${signup ? 'sign-up/email' : 'sign-in/username'}`, { username: username.trim(), password, ...(signup ? { email: email.trim(), name: username.trim() } : {}) });
      location.reload();
    } catch (error) { setError(failure(error));setBusy(false); }
  }
  return <dialog ref={dialog} className="join-dialog" aria-labelledby="account-title" onCancel={event => { event.preventDefault();if (!busy) close(); }}>
    <h2 id="account-title">{signup ? 'Create account' : 'Sign in'}</h2>
    <form onSubmit={submit}>
      <label htmlFor="account-username">Username</label><input id="account-username" autoFocus autoComplete="username" required minLength={signup ? 3 : undefined} maxLength={32} value={username} disabled={busy} onChange={event => setUsername(event.target.value)}/>
      {signup && <><p className="muted">3–32 letters, digits, hyphens or underscores, starting with a letter. Your username is part of your public rocket URLs.</p><label htmlFor="account-email">Email</label><input id="account-email" type="email" autoComplete="email" required value={email} disabled={busy} onChange={event => setEmail(event.target.value)}/></>}
      <label htmlFor="account-password">Password</label><input id="account-password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={signup ? 8 : undefined} maxLength={128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)}/>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="window-footer"><button type="button" onClick={close} disabled={busy}>Cancel</button><button type="submit" disabled={busy}>{busy ? 'Working…' : signup ? 'Create account' : 'Sign in'}</button></div>
    </form>
  </dialog>;
}
function RocketLibrary({ user, owner }: { user: AccountUser | null; owner?: string }) {
  const [rockets, setRockets] = useState<PublicRocket[]>([]), [loaded, setLoaded] = useState(false);
  const [name, setName] = useState(''), [uploadName, setUploadName] = useState(''), [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [pendingDelete, setPendingDelete] = useState<PublicRocket>();
  const [pendingRename, setPendingRename] = useState<PublicRocket>();
  async function load() { const result = await accountRequest<{ rockets: PublicRocket[] }>('/api/rockets' + (owner ? `?owner=${encodeURIComponent(owner)}` : ''));setRockets(result.rockets);setLoaded(true); }
  useEffect(() => { void load().catch(error => setError(failure(error))); }, [owner]);
  function choose(selected?: File) { setFile(selected);if (selected && !uploadName.trim()) setUploadName(selected.name.replace(/\.ork$/i, '').slice(0, 100)); }
  async function create(event: React.FormEvent, upload: boolean) {
    event.preventDefault();setBusy(true);setError('');
    try {
      let body: object | FormData = { name };
      if (upload) {
        if (!file) throw new Error('Choose an .ork file to upload');
        if (file.size > LIMITS.upload) throw new Error('File exceeds the 4 MiB upload limit');
        const form = new FormData();form.set('name', uploadName);form.set('file', file);body = form;
      }
      const { rocket } = await accountRequest<{ rocket: PublicRocket }>('/api/rockets', body);location.assign(rocketPath(rocket));
    } catch (error) { setError(failure(error));setBusy(false); }
  }
  return <section className="rocket-library">
    <h1>{owner ? `${owner}'s rockets` : 'Public rockets'}</h1>
    <p>Open a rocket to view it. Everyone with an account can edit together.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {user && (!owner || owner === user.username) && <div className="rocket-create-grid">
      <form className="new-rocket" onSubmit={event => void create(event, false)} aria-label="Start from scratch">
        <h2>Start from scratch</h2><p>Create an empty rocket and add your components.</p>
        <label htmlFor="rocket-name">Rocket name</label><input id="rocket-name" required maxLength={100} value={name} disabled={busy} onChange={event => setName(event.target.value)}/>
        <button type="submit" disabled={busy}>{busy ? 'Working…' : 'Create rocket'}</button>
      </form>
      <form className="new-rocket upload-rocket" onSubmit={event => void create(event, true)} aria-label="Upload a rocket">
        <h2>Upload a rocket</h2><p>Start with an existing OpenRocket file.</p>
        <div className="rocket-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault();if (busy) return;if (event.dataTransfer.files.length !== 1) { setError('Choose one .ork file to upload');return; }choose(event.dataTransfer.files[0]); }}>
          <label htmlFor="rocket-file">Drop an .ork file here or choose a file</label><input id="rocket-file" aria-label="Rocket file (.ork)" type="file" accept=".ork" disabled={busy} onChange={event => choose(event.target.files?.[0])}/>
          {file && <p>Selected: {file.name}</p>}
        </div>
        <label htmlFor="uploaded-name">Uploaded rocket name</label><input id="uploaded-name" required maxLength={100} value={uploadName} disabled={busy} onChange={event => setUploadName(event.target.value)}/>
        <button type="submit" disabled={busy || !file}>{busy ? 'Working…' : 'Upload rocket'}</button>
      </form>
    </div>}
    <div className="rocket-list" aria-label="Public rockets">{rockets.map(rocket => <article key={rocket.id}>
      <a href={rocketPath(rocket)}><strong>{rocket.name}</strong><span>{rocketPath(rocket)}</span></a>
      <div className="management-actions"><span>by <a href={rocket.username === 'admin' ? '/?owner=admin' : `/${rocket.username}/`}>{rocket.username}</a></span>
        {user && (user.id === rocket.ownerId || user.isAdmin) && <><button onClick={() => setPendingRename(rocket)}>Rename rocket</button><button className="danger-button" onClick={() => setPendingDelete(rocket)}>Delete rocket</button></>}
      </div>
    </article>)}</div>
    {pendingRename && <RenameRocket rocket={pendingRename} close={() => setPendingRename(undefined)} renamed={async () => { await load(); }}/>}
    {pendingDelete && <ConfirmAction title="Delete rocket" confirm="Delete rocket" close={() => setPendingDelete(undefined)} action={async () => { await accountRequest(`/api/rockets/${pendingDelete.username}/${pendingDelete.slug}?rocketId=${pendingDelete.id}`, undefined, 'DELETE');await load(); }}>
      <p>Are you sure you want to permanently delete “{pendingDelete.name}”?</p><p>This cannot be undone. Connected editors will lose access.</p>
    </ConfirmAction>}
    {loaded && !rockets.length && <p>No rockets yet.{!user ? ' Create an account to start one.' : ''}</p>}
  </section>;
}
export function AccountShell({ renderEditor }: { renderEditor: (rocket: PublicRocket) => ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null), [ready, setReady] = useState(false);
  const [form, setForm] = useState<'signin' | 'signup'>(), [error, setError] = useState('');
  const [rocket, setRocket] = useState<PublicRocket>(), [deleteCurrent, setDeleteCurrent] = useState(false);
  const [renameCurrent, setRenameCurrent] = useState(false);
  const parts = location.pathname.split('/').filter(Boolean), owner = parts[0] || new URLSearchParams(location.search).get('owner') || undefined;
  const adminPage = location.pathname === '/admin/';
  const settingsPage = location.pathname === '/' && new URLSearchParams(location.search).get('account') === 'settings';
  useEffect(() => {
    void (async () => {
      const session = await accountRequest<{ user: AccountUser | null }>('/api/session');setUser(session.user);
      if (parts.length === 2) setRocket((await accountRequest<{ rocket: PublicRocket }>(`/api/rockets/${parts[0]}/${parts[1]}`)).rocket);
      setReady(true);
    })().catch(error => setError(failure(error)));
  }, []);
  async function signOut() {
    try { await accountRequest('/api/auth/sign-out', {});location.reload(); }
    catch (error) { setError(failure(error)); }
  }
  return <>
    <nav className="account-bar" aria-label="Account">
      <a href="/">All rockets</a>{user && !user.mustChangePassword && <a href={user.username === 'admin' ? '/?owner=admin' : `/${user.username}/`}>My rockets</a>}{user?.isAdmin && !user.mustChangePassword && <a href="/admin/">Admin panel</a>}
      {user && !user.mustChangePassword && <a href="/?account=settings">Account settings</a>}
      {rocket && <span className="rocket-owner"><strong>{rocket.name}</strong> · {rocketPath(rocket)}</span>}
      {rocket && user && !user.mustChangePassword && (user.id === rocket.ownerId || user.isAdmin) && <><button onClick={() => setRenameCurrent(true)}>Rename rocket</button><button className="danger-button" onClick={() => setDeleteCurrent(true)}>Delete rocket</button></>}
      <div>{user ? <><span>Signed in as {user.username}</span><button onClick={() => void signOut()}>Sign out</button></> : <><button onClick={() => setForm('signin')}>Sign in</button><button onClick={() => setForm('signup')}>Create account</button></>}</div>
    </nav>
    {error ? <section className="rocket-library"><p role="alert" className="error">{error}</p><a href="/">Back to public rockets</a></section> : !ready ? <p role="status">Loading rockets…</p> : user?.mustChangePassword ? <AccountSettings initial/> : settingsPage ? user ? <AccountSettings/> : <p role="alert">Sign in to change your password.</p> : adminPage ? user?.isAdmin ? <AdminPanel/> : <p role="alert">Administrator access required</p> : rocket ? renderEditor(rocket) : <RocketLibrary user={user} owner={owner}/>}
    {renameCurrent && rocket && <RenameRocket rocket={rocket} close={() => setRenameCurrent(false)} renamed={setRocket}/>}
    {deleteCurrent && rocket && <ConfirmAction title="Delete rocket" confirm="Delete rocket" close={() => setDeleteCurrent(false)} action={async () => { await accountRequest(`/api/rockets/${rocket.username}/${rocket.slug}?rocketId=${rocket.id}`, undefined, 'DELETE');location.assign('/'); }}>
      <p>Are you sure you want to permanently delete “{rocket.name}”?</p><p>This cannot be undone. Connected editors will lose access.</p>
    </ConfirmAction>}
    {form && <AccountForm signup={form === 'signup'} close={() => setForm(undefined)}/>}
  </>;
}
