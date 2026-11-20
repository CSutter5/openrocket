import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LIMITS } from '@openrocket/ork-format';
import { request } from './bridge';
import type { Action, DocumentView } from './model';
import { Properties } from './Properties';
import { MotorSelector } from './MotorSelector';
import { ComponentIcon, ComponentPalette, MotorConfigurations, WindowPanel } from './WorkspacePanels';
import { RocketDrawing } from './RocketDrawing';
import { lengthUnits, type LengthUnit } from './units';
import { treeControls, type TreeOperation } from './component-tree';
import { additionTarget } from './components';
import { FlightPanel } from './simulation/FlightPanel';
import './style.css';

type PendingComponent = Omit<Extract<Action, { type: 'addComponent' }>, 'position'>;
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function App() {
  const [document, setDocument] = useState<DocumentView>();
  const [selected, setSelected] = useState(0);
  const [unit, setUnit] = useState<LengthUnit>('m');
  const [tab, setTab] = useState('design');
  const [editor, setEditor] = useState(false);
  const [motorSelector, setMotorSelector] = useState<'assign' | 'create'>();
  const [insertion, setInsertion] = useState<PendingComponent>();
  const [help, setHelp] = useState(false);
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
    try { const reply = await request(action); setDocument(reply.view); setNotice(reply.notice);
      if (reply.selectedId) { setSelected(reply.view.components.findIndex(c => c.id === reply.selectedId)); if (action.type === 'addComponent') setEditor(true); }
      if (action.type === 'componentTree') setEditor(false);
      if (action.type === 'new') { setSelected(1); setEditor(false); }
      return true; }
    catch (failure) { setError(`Edit rejected; accepted document retained. ${message(failure)}`); return false; }
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
      <button data-component-id={n.id} disabled={busy} aria-label={`${n.name || '(unnamed)'} ${n.type}`} aria-pressed={selected === i} onClick={() => { setSelected(i); setError(''); }} onDoubleClick={() => setEditor(true)}>
        <ComponentIcon type={n.type}/><span>{n.name || '(unnamed)'}</span>
      </button>{tree(i)}
    </li>)}</ul>;
  }
  function selectConfiguration(configurationId: string) {
    if (document) void perform({ type: 'flightConfiguration', expectedHash: document.hash, configurationId });
  }
  function createComponent(type: string) {
    const target = additionTarget(components, selected, type);
    if (!target || !document || !component?.id) return;
    const action: PendingComponent = { type: 'addComponent', expectedHash: document.hash, selectedId: component.id, componentType: type };
    if (target.after !== undefined && components.some((c, i) => c.parent === target.parent && i > selected)) setInsertion(action);
    else void insertComponent(action, 'end');
  }
  async function insertComponent(action: PendingComponent, position: 'after' | 'end') {
    if (await perform({ ...action, position })) setInsertion(undefined);
  }
  const controls = treeControls(components, selected);
  function treeAction(operation: TreeOperation) {
    if (document && component?.id) void perform({ type: 'componentTree', expectedHash: document.hash, id: component.id, operation });
  }
  const tabs = [['design', 'Rocket design'], ['motors', 'Motors & Configuration'], ['simulations', 'Flight simulations']];
  function tabKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : -1;
    if (next < 0) return;
    event.preventDefault(); setTab(tabs[next][0]); window.document.getElementById(`tab-${tabs[next][0]}`)?.focus();
  }
  return <>
    <header className="app-header">
      <div className="menu-bar">
        <details className="file-menu" onKeyDown={event => {
          if (event.key === 'Escape') { event.currentTarget.removeAttribute('open'); event.currentTarget.querySelector('summary')?.focus(); }
        }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute('open'); }}><summary>File</summary><div className="menu-popup" onClick={event => event.currentTarget.closest('details')?.removeAttribute('open')}>
          <button disabled={busy} onClick={() => perform({ type: 'new' })}>New</button>
          <button disabled={busy} onClick={() => openSample('rocket-sample.ork')}>Open rocket sample</button>
          <button disabled={busy} onClick={() => openSample('flight-ready.ork')}>Open flight-ready sample</button>
          <button disabled={busy} onClick={() => openSample('explicit-tube.ork')}>Open explicit tube sample</button>
          <p>Opening a file replaces this browser session.</p>
        </div></details>
        <button disabled={!component} onClick={() => setEditor(true)}>Edit component</button>
        <button onClick={() => setHelp(true)}>Help</button>
        <span className="app-name">OpenRocket <span>Web</span></span>
      </div>
      <div className="file-toolbar" aria-label="Local files">
        <label className="file-open">Open local .ork<input type="file" accept=".ork" disabled={busy} onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (file) void open(async () => {
            if (file.size > LIMITS.upload) throw new Error('File exceeds the 4 MiB upload limit');
            return new Uint8Array(await file.arrayBuffer());
          }, file.name);
        }}/></label>
        <button disabled={busy || !document} onClick={download}>Download .ork</button>
        <strong className="filename">{document?.filename ?? 'Opening rocket…'}</strong>
        <span className="session-label">Local session</span>
      </div>
      <div className="workspace-tabs" role="tablist" aria-label="Rocket workspace">
        {tabs.map(([id, label], index) => <button key={id} id={`tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} tabIndex={tab === id ? 0 : -1} onKeyDown={event => tabKey(event, index)} onClick={() => setTab(id)}>{label}</button>)}
      </div>
    </header>
    <main>
      {error && <p role="alert" className="error app-error">{error}</p>}
      {document && <>
        <div className="upper-workspace">
          <section id="panel-design" role="tabpanel" aria-labelledby="tab-design" hidden={tab !== 'design'} className="design-panel">
            <nav aria-label="Component tree" className="component-tree"><h2>Rocket</h2>{tree()}</nav>
            <div className="tree-actions">
              <button disabled={busy || document.mode !== 'editable' || !controls.up} onClick={() => treeAction('up')}>Move up</button>
              <button disabled={busy || document.mode !== 'editable' || !controls.down} onClick={() => treeAction('down')}>Move down</button>
              <button disabled={busy || !component} onClick={() => setEditor(true)}>Edit</button>
              <button disabled={busy || document.mode !== 'editable' || !controls.duplicate || components.length >= 64} onClick={() => treeAction('duplicate')}>Duplicate</button>
              <button disabled={busy || document.mode !== 'editable' || !controls.delete} onClick={() => treeAction('delete')}>Delete</button>
            </div>
            <ComponentPalette components={components} selected={selected} disabled={busy || document.mode !== 'editable' || components.length >= 64} create={createComponent}/>
          </section>
          <section id="panel-motors" role="tabpanel" aria-labelledby="tab-motors" hidden={tab !== 'motors'}>
            <MotorConfigurations key={document.identitySidecarHash} document={document} busy={busy} select={selectConfiguration} openSelector={() => setMotorSelector('assign')} create={() => setMotorSelector('create')} rename={(configurationId, name) => perform({ type: 'renameConfiguration', expectedHash: document.hash, configurationId, name })} remove={configurationId => perform({ type: 'deleteConfiguration', expectedHash: document.hash, configurationId })}/>
          </section>
          <div id="panel-simulations" role="tabpanel" aria-labelledby="tab-simulations" hidden={tab !== 'simulations'}>
            <FlightPanel document={document} busy={busy} unit={unit} setUnit={setUnit}/>
          </div>
        </div>
        <div className="splitter" aria-hidden="true">•••</div>
        <div className="view-toolbar">
          <div><span>View type</span><strong>Side view</strong></div>
          <div className="unit-choice"><label htmlFor="length-units">Length units</label><select id="length-units" value={unit} disabled={busy} onChange={event => setUnit(event.target.value as LengthUnit)}>
            {lengthUnits.map(u => <option key={u.id} value={u.id}>{u.label} ({u.id})</option>)}
          </select></div>
          <div className="stage-label"><span>Stage</span><strong>{components.find(c => c.type === 'stage')?.name ?? '—'}</strong></div>
          <div className="configuration-choice"><label htmlFor="view-configuration">Flight configuration</label><select id="view-configuration" value={document.flightConfigurationId ?? ''} disabled={busy || !document.flightConfigurations.length} onChange={event => selectConfiguration(event.target.value)}>
            {!document.flightConfigurations.length && <option value="">No motor configuration</option>}
            {document.flightConfigurations.map(c => <option key={c.id} value={c.id}>{c.label}{c.isDefault ? ' · archived default' : ''}</option>)}
          </select></div>
        </div>
        <RocketDrawing unit={unit} drawing={document.drawing} stability={document.stability} components={components} selected={selected} busy={busy} select={index => { setSelected(index); setError(''); }} edit={() => setEditor(true)}/>
        <details className="document-info" open={document.mode === 'preservation'}><summary>Document information · {components.length} components{document.diagnostics.length ? ` · ${document.diagnostics.length} notices` : ''}</summary>
          <p>{document.mode === 'editable' ? 'Component properties and tree editable' : 'Preservation only: all properties read-only'}. Unsupported properties and attachments are preserved.</p>
          {document.diagnostics.map((d, i) => <p key={i}>{d}</p>)}
        </details>
        {editor && component && <WindowPanel title="Component editor" close={() => { setEditor(false); }}>
          <Properties key={`${selected}:${document.hash}`} component={component} expectedHash={document.hash} unit={unit} editable={document.mode === 'editable'} busy={busy} edit={perform}/>
          <div className="window-footer"><span>Changes apply individually to this session.</span><button onClick={() => { setEditor(false); }}>Close</button></div>
        </WindowPanel>}
        {insertion && <WindowPanel title="Insert component" close={() => setInsertion(undefined)}><p>Where should the new component be added?</p><div className="window-footer"><button onClick={() => setInsertion(undefined)}>Cancel</button><button disabled={busy} onClick={() => insertComponent(insertion, 'after')}>Insert after selected component</button><button disabled={busy} onClick={() => insertComponent(insertion, 'end')}>Add to the end</button></div></WindowPanel>}
        {motorSelector && <MotorSelector key={`${document.identitySidecarHash}:${document.flightConfigurationId}:${motorSelector}`} document={document} busy={busy} creating={motorSelector === 'create'} close={() => setMotorSelector(undefined)} assign={(mountId, motorKey, delay, name) => motorSelector === 'create' ? perform({ type: 'createConfiguration', expectedHash: document.hash, name: name!, mountId, motorKey, delay }) : perform({ type: 'assignMotor', expectedHash: document.hash, configurationId: document.flightConfigurationId!, mountId, motorKey, delay })}/>}
      </>}
      <div className="status-bar"><p role="status">{busy ? 'Working…' : notice}</p><span data-testid="dirty">{document?.dirty ? 'Changed since import / export' : 'No changes since import / export'}</span></div>
    </main>
    {help && <WindowPanel title="About this web editor" close={() => setHelp(false)}>
      <h2>OpenRocket in your browser</h2><p>Open a local .ork file or choose a sample from File. Select a component, then choose Edit or double-click to open its properties.</p>
      <p>Work stays in this browser session. Download your .ork to keep changes; opening another file or reloading discards the session. Flight results stay in the session and are not written to downloads.</p>
      <p>Add components using the palette. New parts use OpenRocket defaults and open in the component editor. Edit component values in Imported properties; move, duplicate or delete components with the tree controls. 3D, accounts and collaboration are not yet available.</p>
      <div className="window-footer"><button onClick={() => setHelp(false)}>Close</button></div>
    </WindowPanel>}
  </>;
}
createRoot(document.getElementById('root')!).render(<App/>);
