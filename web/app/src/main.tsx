import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { componentNames, importArchive, LIMITS, type ExpandedArchive, type XmlNode } from '@openrocket/ork-format';
import './style.css';

function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function App() {
  const [archive, setArchive] = useState<ExpandedArchive>();
  const [filename, setFilename] = useState('');
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function open(load: () => Promise<Uint8Array>, name: string) {
    setBusy(true); setError('');
    try {
      const next = await importArchive(await load());
      setArchive(next); setFilename(name); setSelected(0);
    } catch (failure) { setError(`Import rejected; previous document retained. ${message(failure)}`); }
    finally { setBusy(false); }
  }
  const components = archive ? componentNames(archive) : [];
  const nodes = archive?.parsed.components ?? [];
  const node = nodes[selected], component = components[selected];
  function tree(parent?: XmlNode): React.ReactNode {
    const children = nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.parent?.parent === parent);
    return <ul>{children.map(({ n, i }) => <li key={i}>
      <button disabled={busy} aria-pressed={selected === i} onClick={() => setSelected(i)}>
        {components[i].name || '(unnamed)'} <small>{n.name}</small>
      </button>{tree(n)}
    </li>)}</ul>;
  }
  return <>
    <header><div><p className="eyebrow">OPENROCKET / LOCAL POC</p><h1>Rocket editor</h1></div><span className="badge">Local memory only</span></header>
    <main>
      <section className="toolbar" aria-label="Local files">
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
      </section>
      <p className="muted">One document, one browser. Opening another file or reloading discards this session. No account or backend is used.</p>
      {error && <p role="alert" className="error">{error}</p>}
      <p role="status">{busy ? 'Opening archive…' : archive ? `${filename} · ${components.length} components · ${archive.mode === 'editable' ? 'Supported name projection' : 'Preservation only: read-only'}` : 'Open the bundled sample or a local archive to begin.'}</p>
      {archive && <div className="workspace">
        <nav aria-label="Component tree"><h2>Components</h2>{tree()}</nav>
        <section aria-label="Component properties"><h2>{component?.name || 'Properties'}</h2>
          <dl><dt>Type</dt><dd>{component?.type}</dd><dt>Component ID</dt><dd>{component?.id || 'Missing; read-only'}</dd></dl>
          <h3>Imported properties · read-only</h3>
          <dl>{node?.children.filter(n => !n.children.length && !['name', 'id'].includes(n.name)).map((n, i) => <React.Fragment key={i}><dt>{n.name}</dt><dd>{n.text.slice(0, 200) || '(empty)'}</dd></React.Fragment>)}</dl>
          <p className="muted">This first editor view preserves properties as imported. Geometry and other component types have no editor here.</p>
          {archive.diagnostics.map((d, i) => <p key={i}>{d}</p>)}
        </section>
      </div>}
    </main>
    <footer>Bounded local proof of concept · Simulations, accounts, collaboration and full desktop compatibility are deferred.</footer>
  </>;
}
createRoot(document.getElementById('root')!).render(<App/>);
