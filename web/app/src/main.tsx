import React, { useContext, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LIMITS } from '@openrocket/ork-format';
import { request, collaborationAvailable, connectShared, subscribeCollaboration, type CollaborationStatus } from './bridge';
import type { Action, DocumentView } from './model';
import { ComponentEditor } from './ComponentEditor';
import { EditorUnits } from './QuantityInput';
import { MotorSelector } from './MotorSelector';
import { ComponentIcon, ComponentPalette, MotorConfigurations, WindowPanel } from './WorkspacePanels';
import { RocketDrawing } from './RocketDrawing';
import { lengthUnits, type LengthUnit } from './units';
import { treeControls, type TreeOperation } from './component-tree';
import { additionTarget } from './components';
import { AccountShell } from './AccountShell';
import type { PublicRocket } from './accounts';
import { FlightPanel } from './simulation/FlightPanel';
import type { SessionResult } from './simulation/provenance';
import { PreferencesContext } from './PreferencesContext';
import './style.css';
import './themes.css';

type PendingComponent = Omit<Extract<Action, { type: 'addComponent' }>, 'position'>;
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function App({ sharedRocket }: { sharedRocket?: PublicRocket }) {
  const preferences = useContext(PreferencesContext);
  const [document, setDocument] = useState<DocumentView>();
  const [flightResults, setFlightResults] = useState<Record<string, SessionResult>>({});
  const [selected, setSelected] = useState(0);
  const [unit, setUnit] = useState<LengthUnit>((preferences?.units.LENGTH ?? 'm') as LengthUnit);
  const [simulationUnit, setSimulationUnit] = useState<LengthUnit>((preferences?.units.DISTANCE ?? 'm') as LengthUnit);
  const [tab, setTab] = useState('design');
  const [editor, setEditorOpen] = useState(false);
  const [editorContext, setEditorContext] = useState<{ view: DocumentView; id: string }>();
  const [editorTab, setEditorTab] = useState('General');
  const [editorUnits, setEditorUnits] = useState<Record<string, string>>({});
  const [motorSelector, setMotorSelector] = useState<'assign' | 'create'>();
  const [insertion, setInsertion] = useState<PendingComponent>();
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('Open the bundled sample or a local archive to begin.');
  const selection = useRef({ document, selected });
  selection.current = { document, selected };
  const shared = !!sharedRocket;
  const [collaboration, setCollaboration] = useState<CollaborationStatus>({ phase: 'local', username: '', users: [], canEdit: false, canDownload: false });
  useEffect(() => {
    const unsubscribe = subscribeCollaboration((status, reply) => {
      setCollaboration(status);
      if (status.phase === 'deleted') setError('This rocket was deleted. Return to All rockets.');
      if (status.phase === 'revoked' || status.phase === 'deleted') { setDocument(undefined);setEditorOpen(false);setMotorSelector(undefined);setInsertion(undefined); }
      if (status.phase === 'revoked') setError('Access to this rocket is no longer available. Return to All rockets or sign in again.');
      if (reply) {
        const id = selection.current.document?.components[selection.current.selected]?.id;
        const found = reply.view.components.findIndex(c => c.id === id);
        setSelected(found < 0 ? 0 : found); setDocument(reply.view);
        setMotorSelector(undefined); setInsertion(undefined); setNotice(reply.notice);
      }
    });
    setBusy(true);
    void (sharedRocket ? connectShared(sharedRocket.routeUsername, sharedRocket.slug, sharedRocket.id) : openSample('rocket-sample.ork'))
      .catch(failure => setError(message(failure))).finally(() => setBusy(false));
    return unsubscribe;
  }, []);
  const blocked = busy || shared && collaboration.phase !== 'connected';
  const readOnly = shared && !collaboration.canEdit;
  useEffect(() => {
    if (shared || !document?.dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [document?.dirty, shared]);
  function setEditor(open: boolean, view = selection.current.document, id = view?.components[selection.current.selected]?.id) {
    setEditorOpen(open);
    if (open && view && id) setEditorContext({ view, id });
  }
  async function perform(action: Action) {
    setBusy(true); setError('');
    try { const reply = await request(action); setDocument(reply.view); setNotice(reply.notice);
      if (shared) setEditorContext(current => current && reply.view.components.some(c => c.id === current.id) ? { ...current, view: reply.view } : current);
      if (reply.selectedId) { setSelected(reply.view.components.findIndex(c => c.id === reply.selectedId)); if (action.type === 'addComponent') { setEditorTab('General');setEditor(true, reply.view, reply.selectedId); } }
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
      if (sharedRocket) {
        const response = await fetch(`/api/rockets/${sharedRocket.routeUsername}/${sharedRocket.slug}/download?rocketId=${sharedRocket.id}`);
        if (!response.ok) throw new Error((await response.json()).error);
        const url = URL.createObjectURL(await response.blob()), link = window.document.createElement('a');
        link.href = url;link.download = (document?.filename ?? sharedRocket.slug).replace(/\.ork$/i, '') + '-edited.ork';
        link.click();setTimeout(() => URL.revokeObjectURL(url), 1000);setNotice('Shared rocket downloaded.');return;
      }
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
  const editorView = shared && editorContext ? editorContext.view : document;
  const editorComponent = shared && editorContext ? editorView?.components.find(c => c.id === editorContext.id) : component;
  const staleEditor = shared && editorView && document && (editorView.hash !== document.hash || editorView.identitySidecarHash !== document.identitySidecarHash);
  async function editFromDialog(action: Action) {
    if (staleEditor) { setError('The shared file changed. Your draft is kept in the editor; copy it before closing and reopening to use the latest file.');return false; }
    return perform(action);
  }
  function selectComponent(index: number) {
    setSelected(index); setError('');
    if (editor) setEditor(true, document, components[index]?.id);
  }
  function tree(parent = -1): React.ReactNode {
    const children = components.map((n, i) => ({ n, i })).filter(({ n }) => n.parent === parent);
    if (!children.length) return null;
    return <ul>{children.map(({ n, i }) => <li key={i}>
      <button data-component-id={n.id} disabled={blocked} aria-label={`${n.name || '(unnamed)'} ${n.type}`} aria-pressed={selected === i} onClick={() => selectComponent(i)} onDoubleClick={() => setEditor(true)}>
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
          <button disabled={blocked || readOnly} onClick={() => shared ? location.assign(`/${collaboration.username}/`) : perform({ type: 'new' })}>{shared ? 'New rocket' : 'New'}</button>
          <button disabled={blocked || readOnly} onClick={() => openSample('rocket-sample.ork')}>Open rocket sample</button>
          <button disabled={blocked || readOnly} onClick={() => openSample('flight-ready.ork')}>Open flight-ready sample</button>
          <button disabled={blocked || readOnly} onClick={() => openSample('explicit-tube.ork')}>Open explicit tube sample</button>
          <p>{shared ? 'Opening a file replaces the shared file for everyone.' : 'Opening a file replaces this browser session.'}</p>
        </div></details>
        <button disabled={!component} onClick={() => setEditor(true)}>Edit component</button>
        <button onClick={() => setHelp(true)}>Help</button>
        <span className="app-name">OpenRocket <span>Web</span></span>
      </div>
      <div className="file-toolbar" aria-label="Local files">
        <label className="file-open">Open local .ork<input type="file" accept=".ork" disabled={blocked || readOnly} onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (file) void open(async () => {
            if (file.size > LIMITS.upload) throw new Error('File exceeds the 4 MiB upload limit');
            return new Uint8Array(await file.arrayBuffer());
          }, file.name);
        }}/></label>
        <button disabled={blocked || !document || shared && !collaboration.canDownload} title={shared && !collaboration.canDownload ? 'The owner has not allowed downloads for you' : undefined} onClick={download}>Download .ork</button>
        <strong className="filename">{document?.filename ?? 'Opening rocket…'}</strong>
        <span className="session-label" role={shared ? 'status' : undefined}>{shared ? `${collaboration.phase === 'connected' ? 'Connected' : collaboration.phase === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}${collaboration.username ? ` · ${collaboration.username}` : ''}` : 'Local session'}</span>
      </div>
      <div className="workspace-tabs" role="tablist" aria-label="Rocket workspace">
        {tabs.map(([id, label], index) => <button key={id} id={`tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} tabIndex={tab === id ? 0 : -1} onKeyDown={event => tabKey(event, index)} onClick={() => setTab(id)}>{label}</button>)}
      </div>
    </header>
    {shared && collaboration.phase !== 'local' && <div className="collaboration-bar" aria-label="Collaborators">{collaboration.phase === 'connected' ? `${readOnly ? 'Viewing · Editor access required to make changes · ' : ''}Connected (${collaboration.users.length}): ${collaboration.users.join(', ')}` : collaboration.phase === 'deleted' ? 'Rocket deleted' : collaboration.phase === 'revoked' ? 'Rocket access revoked' : 'Connecting to the shared file… Editing will resume when connected.'}</div>}
    <main>
      {error && <p role="alert" className="error app-error">{error}</p>}
      {document && <>
        <div className="upper-workspace">
          <section id="panel-design" role="tabpanel" aria-labelledby="tab-design" hidden={tab !== 'design'} className="design-panel">
            <nav aria-label="Component tree" className="component-tree"><h2>Rocket</h2>{tree()}</nav>
            <div className="tree-actions">
              <button disabled={blocked || readOnly || document.mode !== 'editable' || !controls.up} onClick={() => treeAction('up')}>Move up</button>
              <button disabled={blocked || readOnly || document.mode !== 'editable' || !controls.down} onClick={() => treeAction('down')}>Move down</button>
              <button disabled={blocked || !component} onClick={() => setEditor(true)}>Edit</button>
              <button disabled={blocked || readOnly || document.mode !== 'editable' || !controls.duplicate || components.length >= 64} onClick={() => treeAction('duplicate')}>Duplicate</button>
              <button disabled={blocked || readOnly || document.mode !== 'editable' || !controls.delete} onClick={() => treeAction('delete')}>Delete</button>
            </div>
            <ComponentPalette components={components} selected={selected} disabled={blocked || readOnly || document.mode !== 'editable' || components.length >= 64} create={createComponent}/>
          </section>
          <section id="panel-motors" role="tabpanel" aria-labelledby="tab-motors" hidden={tab !== 'motors'}>
            <MotorConfigurations key={document.identitySidecarHash} document={document} busy={blocked || readOnly} select={selectConfiguration} openSelector={() => setMotorSelector('assign')} create={() => setMotorSelector('create')} rename={(configurationId, name) => perform({ type: 'renameConfiguration', expectedHash: document.hash, configurationId, name })} remove={configurationId => perform({ type: 'deleteConfiguration', expectedHash: document.hash, configurationId })}/>
          </section>
          <div id="panel-simulations" role="tabpanel" aria-labelledby="tab-simulations" hidden={tab !== 'simulations'}>
            <FlightPanel document={document} busy={blocked} unit={preferences ? simulationUnit : unit} setUnit={preferences ? setSimulationUnit : setUnit} results={flightResults} onResult={(id, result) => setFlightResults(previous => ({ ...previous, [id]: result }))}/>
          </div>
        </div>
        <div className="splitter" aria-hidden="true">•••</div>
        <div className="view-toolbar">
          <div><span>View type</span><strong>Side view</strong></div>
          <div className="unit-choice"><label htmlFor="length-units">Length units</label><select id="length-units" value={unit} disabled={blocked} onChange={event => setUnit(event.target.value as LengthUnit)}>
            {lengthUnits.map(u => <option key={u.id} value={u.id}>{u.label} ({u.id})</option>)}
          </select></div>
          <div className="stage-label"><span>Stage</span><strong>{components.find(c => c.type === 'stage')?.name ?? '—'}</strong></div>
          <div className="configuration-choice"><label htmlFor="view-configuration">Flight configuration</label><select id="view-configuration" value={document.flightConfigurationId ?? ''} disabled={blocked || !document.flightConfigurations.length} onChange={event => selectConfiguration(event.target.value)}>
            {!document.flightConfigurations.length && <option value="">No motor configuration</option>}
            {document.flightConfigurations.map(c => <option key={c.id} value={c.id}>{c.label}{c.isDefault ? ' · archived default' : ''}</option>)}
          </select></div>
        </div>
        <RocketDrawing unit={unit} document={document} results={flightResults} components={components} selected={selected} busy={blocked} select={selectComponent} edit={() => setEditor(true)}/>
        <details className="document-info" open={document.mode === 'preservation'}><summary>Document information · {components.length} components{document.diagnostics.length ? ` · ${document.diagnostics.length} notices` : ''}</summary>
          <p>{readOnly ? 'Public read-only view: sign in to edit' : document.mode === 'editable' ? 'Component properties and tree editable' : 'Preservation only: all properties read-only'}. Unsupported properties and attachments are preserved.</p>
          {document.diagnostics.map((d, i) => <p key={i}>{d}</p>)}
        </details>
        {editor && editorView && editorComponent && <WindowPanel title="Component editor" className="component-editor-window" close={() => { if (!busy) setEditor(false); }}>
          {staleEditor && <p role="status">The shared file changed. Your draft is kept here. Copy it before closing and reopening this editor.</p>}
          <EditorUnits.Provider value={{ length: unit, units: Object.fromEntries(Object.entries(editorUnits).filter(([key]) => key.startsWith(editorComponent.id + ':')).map(([key, value]) => [key.slice(editorComponent.id!.length + 1), value])), choose: (key, value) => setEditorUnits(current => ({ ...current, [`${editorComponent.id}:${key}`]: value })) }}>
            <ComponentEditor key={`${editorComponent.id}:${editorView.hash}`} component={editorComponent} document={editorView} unit={unit} editable={editorView.mode === 'editable' && !readOnly} busy={blocked} edit={editFromDialog} close={() => setEditor(false)} motors={() => { setEditor(false);setTab('motors'); }} tab={editorTab} setTab={setEditorTab}/>
          </EditorUnits.Provider>
        </WindowPanel>}
        {insertion && <WindowPanel title="Insert component" close={() => setInsertion(undefined)}><p>Where should the new component be added?</p><div className="window-footer"><button onClick={() => setInsertion(undefined)}>Cancel</button><button disabled={blocked || readOnly} onClick={() => insertComponent(insertion, 'after')}>Insert after selected component</button><button disabled={blocked || readOnly} onClick={() => insertComponent(insertion, 'end')}>Add to the end</button></div></WindowPanel>}
        {motorSelector && <MotorSelector key={`${document.identitySidecarHash}:${document.flightConfigurationId}:${motorSelector}`} document={document} busy={blocked} creating={motorSelector === 'create'} close={() => setMotorSelector(undefined)} assign={(mountId, motorKey, delay, name) => motorSelector === 'create' ? perform({ type: 'createConfiguration', expectedHash: document.hash, name: name!, mountId, motorKey, delay }) : perform({ type: 'assignMotor', expectedHash: document.hash, configurationId: document.flightConfigurationId!, mountId, motorKey, delay })}/>}
      </>}
      <div className="status-bar"><p role="status">{busy ? 'Working…' : notice}</p><span data-testid="dirty">{shared ? collaboration.phase === 'connected' ? 'Shared draft saved' : 'Waiting for connection' : document?.dirty ? 'Changed since import / export' : 'No changes since import / export'}</span></div>
    </main>
    {help && <WindowPanel title="About this web editor" close={() => setHelp(false)}>
      <h2>OpenRocket in your browser</h2><p>Open a local .ork file or choose a sample from File. Select a component, then choose Edit or double-click to open its properties.</p>
      <p>{shared ? 'The owner controls viewing, editing and downloads through Share. Changes save automatically; Open replaces this rocket for everyone. New rocket opens your rocket list. Version history is not included.' : 'Work stays in this browser session. Download your .ork to keep changes; opening another file or reloading discards the session.'} Flight results stay in this browser and are not written to downloads.</p>
      <p>Add components using the palette. New parts use OpenRocket defaults and open in the component editor. Use the property tabs and individual unit selectors, then OK to save or Cancel to discard. Additional archive values remain under Advanced. Move, duplicate or delete components with the tree controls. 3D is not yet available.</p>
      <div className="window-footer"><button onClick={() => setHelp(false)}>Close</button></div>
    </WindowPanel>}
  </>;
}
function Application() {
  const [hosted, setHosted] = useState<boolean>(), [error, setError] = useState('');
  useEffect(() => { void collaborationAvailable().then(setHosted).catch(failure => setError(message(failure))); }, []);
  if (error) return <p role="alert" className="error">{error}</p>;
  if (hosted === undefined) return <p role="status">Loading OpenRocket…</p>;
  return hosted ? <AccountShell renderEditor={rocket => <App key={rocket.id} sharedRocket={rocket}/>}/> : <App/>;
}
createRoot(document.getElementById('root')!).render(<Application/>);
