import { useEffect, useRef, useState, type ReactNode } from 'react';
import { accountRequest, rocketPath, type AccountUser, type PublicRocket } from './accounts';
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
      <label htmlFor="account-password">Password</label><input id="account-password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={8} maxLength={128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)}/>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="window-footer"><button type="button" onClick={close} disabled={busy}>Cancel</button><button type="submit" disabled={busy}>{busy ? 'Working…' : signup ? 'Create account' : 'Sign in'}</button></div>
    </form>
  </dialog>;
}
function RocketLibrary({ user, owner }: { user: AccountUser | null; owner?: string }) {
  const [rockets, setRockets] = useState<PublicRocket[]>([]), [loaded, setLoaded] = useState(false);
  const [name, setName] = useState(''), [slug, setSlug] = useState(''), [customSlug, setCustomSlug] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { void accountRequest<{ rockets: PublicRocket[] }>('/api/rockets' + (owner ? `?owner=${encodeURIComponent(owner)}` : '')).then(result => { setRockets(result.rockets);setLoaded(true); }).catch(error => setError(failure(error))); }, [owner]);
  async function create(event: React.FormEvent) {
    event.preventDefault();setBusy(true);setError('');
    try { const { rocket } = await accountRequest<{ rocket: PublicRocket }>('/api/rockets', { name, slug });location.assign(rocketPath(rocket)); }
    catch (error) { setError(failure(error));setBusy(false); }
  }
  return <section className="rocket-library">
    <h1>{owner ? `${owner}'s rockets` : 'Public rockets'}</h1>
    <p>Open a rocket to view it. Everyone with an account can edit together.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {user && (!owner || owner === user.username) && <form className="new-rocket" onSubmit={create}>
      <h2>New rocket</h2>
      <label htmlFor="rocket-name">Rocket name</label><input id="rocket-name" required maxLength={100} value={name} disabled={busy} onChange={event => { setName(event.target.value);if (!customSlug) setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)); }}/>
      <label htmlFor="rocket-slug">URL name</label><div className="rocket-url"><span>/{user.username}/</span><input id="rocket-slug" required pattern="[a-z0-9]+(?:[-_][a-z0-9]+)*" maxLength={80} value={slug} disabled={busy} onChange={event => { setCustomSlug(true);setSlug(event.target.value); }}/><span>/</span></div>
      <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create rocket'}</button>
    </form>}
    <div className="rocket-list" aria-label="Public rockets">{rockets.map(rocket => <article key={rocket.id}>
      <a href={rocketPath(rocket)}><strong>{rocket.name}</strong><span>{rocketPath(rocket)}</span></a>
      <span>by <a href={`/${rocket.username}/`}>{rocket.username}</a></span>
    </article>)}</div>
    {loaded && !rockets.length && <p>No rockets yet.{!user ? ' Create an account to start one.' : ''}</p>}
  </section>;
}
export function AccountShell({ renderEditor }: { renderEditor: (rocket: PublicRocket) => ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null), [ready, setReady] = useState(false);
  const [form, setForm] = useState<'signin' | 'signup'>(), [error, setError] = useState('');
  const [rocket, setRocket] = useState<PublicRocket>();
  const parts = location.pathname.split('/').filter(Boolean), owner = parts[0];
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
      <a href="/">All rockets</a>{user && <a href={`/${user.username}/`}>My rockets</a>}
      {rocket && <span className="rocket-owner">{rocketPath(rocket)}</span>}
      <div>{user ? <><span>Signed in as {user.username}</span><button onClick={() => void signOut()}>Sign out</button></> : <><button onClick={() => setForm('signin')}>Sign in</button><button onClick={() => setForm('signup')}>Create account</button></>}</div>
    </nav>
    {error ? <section className="rocket-library"><p role="alert" className="error">{error}</p><a href="/">Back to public rockets</a></section> : !ready ? <p role="status">Loading rockets…</p> : rocket ? renderEditor(rocket) : <RocketLibrary user={user} owner={owner}/>}
    {form && <AccountForm signup={form === 'signup'} close={() => setForm(undefined)}/>}
  </>;
}
