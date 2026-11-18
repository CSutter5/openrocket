import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LIMITS } from '@openrocket/ork-format';
import { request } from './bridge';
import type { Action, ComponentView, DocumentView } from './model';
import { RocketDrawing } from './RocketDrawing';
import { Schematic } from './Schematic';
import './style.css';

function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function Properties({ component, editable, busy, edit }: {
  component: ComponentView; editable: boolean; busy: boolean; edit: (action: Action) => void;
}) {
  const [name, setName] = useState(component.name ?? '');
  const [radius, setRadius] = useState(String(component.tube?.state.radius ?? ''));
  const [numberError, setNumberError] = useState('');
  const tube = component.tube;
  return <>
    <h2>{component.name || '(unnamed)'}</h2>
    <dl><dt>Type</dt><dd>{component.type}</dd><dt>Component ID</dt><dd>{component.id || 'Missing; read-only'}</dd></dl>
    <form onSubmit={event => { event.preventDefault(); edit({ type: 'rename', id: component.id!, expected: component.name!, value: name }); }}>
      <label>Component name<input value={name} maxLength={LIMITS.name} disabled={busy || !editable} onChange={e => setName(e.target.value)}/></label>
      <button disabled={busy || !editable}>Apply name</button>
    </form>
    <form noValidate onSubmit={event => {
      event.preventDefault();
      const value = radius.trim() === '' ? NaN : Number(radius);
      if (!Number.isFinite(value) || value <= 0 || value > 1) { setNumberError('Enter a finite outer radius greater than 0 and at most 1 m. Accepted document retained.'); return; }
      setNumberError(''); edit({ type: 'radius', id: component.id!, expected: tube!.state.radius, value });
    }}>
      <label>BodyTube outer radius (m)<input value={radius} type="text" inputMode="decimal" aria-describedby="radius-help" aria-invalid={!!numberError} disabled={busy || !tube || !editable} onChange={e => setRadius(e.target.value)}/></label>
      <button disabled={busy || !tube || !editable}>Apply radius</button>
      <p id="radius-help" className="muted">{tube ? 'SI metres, (0, 1]. The Java setter may clamp wall thickness, clear a known preset and invalidate stored results.' : `Read-only: ${component.radiusReason}`}</p>
      {numberError && <p role="alert" className="error">{numberError}</p>}
    </form>
    {tube && <section aria-label="Java intrinsic measurements"><h3>Java intrinsic measurements</h3>
      <p className="muted">Per component; excludes mass/CG overrides and motors. These are not whole-rocket values.</p>
      <dl><dt>Outer radius (m)</dt><dd data-testid="radius">{tube.state.radius}</dd>
        <dt>Wall thickness (m)</dt><dd data-testid="thickness">{tube.state.thickness}</dd>
        <dt>Intrinsic mass (kg)</dt><dd data-testid="mass">{tube.state.mass}</dd>
        <dt>Local CG (m)</dt><dd data-testid="cg">{tube.state.cg}</dd>
        <dt>Length input (m)</dt><dd>{tube.input.length}</dd>
        <dt>Preset attached</dt><dd>{tube.state.preset ? 'Yes; digest checked' : 'No'}</dd>
      </dl>
      {'ring' in tube.state && <p>Automatic ring: outer radius {tube.state.ring.outerRadius} m; inner radius {tube.state.ring.innerRadius} m; intrinsic mass {tube.state.ring.mass} kg; local CG {tube.state.ring.cg} m.</p>}
    </section>}
    <details><summary>Imported properties · other values are read-only</summary>
      <p className="muted">Shown as imported, without inferred units or whole-rocket validation. Unsupported properties are preserved.</p>
      <dl>{component.properties.map((p, i) => <React.Fragment key={i}><dt>{p.name}</dt><dd>{p.value}</dd></React.Fragment>)}</dl>
    </details>
  </>;
}
function App() {
  const [document, setDocument] = useState<DocumentView>();
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('Open the bundled sample or a local archive to begin.');
  useEffect(() => { void openSample('rocket-sample.ork'); }, []);
  useEffect(() => {
    if (!document?.dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [document?.dirty]);
  async function perform(action: Action) {
    setBusy(true); setError('');
    try { const reply = await request(action); setDocument(reply.view); setNotice(reply.notice); }
    catch (failure) { setError(`Edit rejected; accepted document retained. ${message(failure)}`); }
    finally { setBusy(false); }
  }
  async function open(load: () => Promise<Uint8Array>, filename: string) {
    setBusy(true); setError('');
    try {
      const reply = await request({ type: 'import', bytes: await load(), filename });
      setDocument(reply.view); setSelected(Math.max(0, reply.view.components.findIndex(c => c.tube))); setNotice(reply.notice);
    } catch (failure) { setError(`Import rejected; previous document retained. ${message(failure)}`); }
    finally { setBusy(false); }
  }
  async function openSample(filename: string) {
    return open(async () => {
      const response = await fetch('/' + filename);
      if (!response.ok) throw new Error('Bundled sample unavailable');
      return new Uint8Array(await response.arrayBuffer());
    }, filename);
  }
  async function download() {
    setBusy(true); setError('');
    try {
      const reply = await request({ type: 'export' });
      const url = URL.createObjectURL(new Blob([reply.bytes!.slice().buffer as ArrayBuffer], { type: 'application/octet-stream' }));
      const link = window.document.createElement('a');
      link.href = url; link.download = reply.view.filename.replace(/\.ork$/i, '') + '-edited.ork';
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDocument(reply.view); setNotice(reply.notice);
    } catch (failure) { setError(`Export failed. ${message(failure)}`); }
    finally { setBusy(false); }
  }
  const components = document?.components ?? [], component = components[selected];
  function tree(parent = -1): React.ReactNode {
    const children = components.map((n, i) => ({ n, i })).filter(({ n }) => n.parent === parent);
    if (!children.length) return null;
    return <ul>{children.map(({ n, i }) => <li key={i}>
      <button disabled={busy} aria-pressed={selected === i} onClick={() => { setSelected(i); setError(''); }}>
        {n.name || '(unnamed)'} <small>{n.type}</small>
      </button>{tree(i)}
    </li>)}</ul>;
  }
  return <>
    <header><div><p className="eyebrow">OPENROCKET / LOCAL POC</p><h1>Rocket editor</h1></div><span className="badge">Local memory only</span></header>
    <main>
      <section className="toolbar" aria-label="Local files">
        <button disabled={busy} onClick={() => openSample('rocket-sample.ork')}>Open rocket sample</button>
        <button disabled={busy} onClick={() => open(async () => {
          const response = await fetch('/explicit-tube.ork');
          if (!response.ok) throw new Error('Bundled sample unavailable');
          return new Uint8Array(await response.arrayBuffer());
        }, 'explicit-tube.ork')}>Open explicit tube sample</button>
        <label>Open local .ork <input type="file" accept=".ork" disabled={busy} onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (file) void open(async () => {
            if (file.size > LIMITS.upload) throw new Error('File exceeds the 4 MiB upload limit');
            return new Uint8Array(await file.arrayBuffer());
          }, file.name);
        }}/></label>
        <button disabled={busy || !document} onClick={download}>Download .ork</button>
      </section>
      <p className="muted">One document, one browser. Opening another file or reloading discards this session, including changes. No account or backend is used.</p>
      {error && <p role="alert" className="error">{error}</p>}
      <p role="status">{busy ? 'Working in the document worker…' : notice}</p>
      {document && <>
        <div className="document-status"><strong>{document.filename}</strong><span>{components.length} components</span>
          <strong data-testid="dirty">{document.dirty ? 'Changed since import / export' : 'No changes since import / export'}</strong>
          <span>{document.mode === 'editable' ? 'Names editable; geometry limited below' : 'Preservation only: all properties read-only'}</span>
        </div>
        {document.diagnostics.map((d, i) => <p key={i}>{d}</p>)}
        <RocketDrawing drawing={document.drawing} components={components} selected={selected} busy={busy} select={index => { setSelected(index); setError(''); }}/>
        <div className="workspace">
          <nav aria-label="Component tree"><h2>Components</h2>{tree()}</nav>
          <section aria-label="Component properties">{component && <Properties key={`${selected}:${document.hash}`} component={component} editable={document.mode === 'editable'} busy={busy} edit={perform}/>}</section>
        </div>
        <details className="preview"><summary>Selected tube measurements and local schematic</summary>{component && <Schematic component={component}/>}</details>
        <details><summary>Stored results · {document.simulations.length} simulations (not run)</summary>
          <p>Imported series are retained, unverified and never executed. Physical edits mark affected stored results outdated.</p>
          <ul>{document.simulations.map((s, i) => <li key={i}>{s.name}: {s.status}</li>)}</ul>
        </details>
      </>}
    </main>
    <footer>Supported geometry: explicit BodyTube scalars accepted by the existing archive projection, the G1-A/G1-B digest-checked proof presets and bounded one-ring dependency. Other properties and shapes are read-only. Simulations, accounts, collaboration and full compatibility are deferred.</footer>
  </>;
}
createRoot(document.getElementById('root')!).render(<App/>);
