import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { ComponentView, DocumentView } from './model';
import { additionTarget } from './components';

const icons = import.meta.glob('../../../swing/src/main/resources/pix/componenticons/*-large.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const iconNames: Record<string, string> = { rocket: 'stage', trapezoidfinset: 'trapezoidfin', masscomponent: 'mass_dark', parallelstage: 'boosters', ellipticalfinset: 'ellipticalfin_dark', freeformfinset: 'freeformfin_dark', tubefinset: 'tubefin', launchlug: 'launchlug_dark', shockcord: 'shockcord_dark', parachute: 'parachute_dark', streamer: 'streamer_dark', podset: 'pods_dark' };
export function ComponentIcon({ type }: { type: string }) {
  const name = iconNames[type] ?? type;
  const src = icons[`../../../swing/src/main/resources/pix/componenticons/${name}-large.png`];
  return src ? <img className="component-icon" src={src} alt=""/> : <span className="component-icon unknown-icon" aria-hidden="true">◇</span>;
}
const groups = [
  { name: 'Assembly components', parts: [['stage', 'Stage'], ['parallelstage', 'Boosters'], ['podset', 'Pods']] },
  { name: 'Body components and fin sets', parts: [['nosecone', 'Nose cone'], ['bodytube', 'Body tube'], ['transition', 'Transition'], ['trapezoidfinset', 'Trapezoidal'], ['ellipticalfinset', 'Elliptical'], ['freeformfinset', 'Freeform'], ['tubefinset', 'Tube fins'], ['railbutton', 'Rail button'], ['launchlug', 'Launch lug']] },
  { name: 'Inner components', parts: [['innertube', 'Inner tube'], ['tubecoupler', 'Tube coupler'], ['centeringring', 'Centering ring'], ['bulkhead', 'Bulkhead'], ['engineblock', 'Engine block']] },
  { name: 'Mass components', parts: [['parachute', 'Parachute'], ['streamer', 'Streamer'], ['shockcord', 'Shock cord'], ['masscomponent', 'Mass component']] },
];
export function ComponentPalette({ components, selected, disabled, create }: { components: ComponentView[]; selected: number; disabled: boolean; create: (type: string) => void }) {
  return <section className="component-palette" aria-label="Add new component"><h2>Add new component</h2>
    {groups.map(group => <div className="palette-group" key={group.name}><h3>{group.name}</h3><div className="palette-items">{group.parts.map(([type, label]) => {
      const target = additionTarget(components, selected, type);
      return <button key={type} disabled={disabled || !target} title={target ? `Add ${label} to ${components[target.parent]?.name}` : 'Select a compatible parent component'} onClick={() => create(type)}><ComponentIcon type={type}/><span>{label}</span></button>;
    })}</div></div>)}
    <p className="muted palette-note">Select a compatible parent to add a component.</p>
  </section>;
}
// Modeless so the drawing, file controls and component selection remain usable.
export function WindowPanel({ title, close, children, className = '' }: { title: string; close: () => void; children: ReactNode; className?: string }) {
  const label = useId(), panel = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={panel} open tabIndex={-1} aria-labelledby={label} className={`window-panel ${className}`} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  }}><div className="window-title"><span id={label}>{title}</span><button aria-label={`Close ${title}`} onClick={close}>×</button></div>
    <div className="window-content">{children}</div>
  </dialog>;
}
export function MotorConfigurations({ document, busy, select, openSelector, create, rename, remove }: { document: DocumentView; busy: boolean; select: (id: string) => void; openSelector: () => void; create: () => void; rename: (id: string, name: string) => Promise<boolean>; remove: (id: string) => Promise<boolean> }) {
  const [dialog, setDialog] = useState<{ kind: 'rename' | 'delete'; id: string }>(), [name, setName] = useState('');
  const selected = document.flightConfigurations.find(c => c.id === document.flightConfigurationId);
  const target = document.flightConfigurations.find(c => c.id === dialog?.id);
  const editable = document.mode === 'editable';
  return <section className="motor-panel" aria-label="Motor configurations">
    <div className="panel-toolbar"><button disabled={busy || !editable || document.flightConfigurations.length >= 16} onClick={create}>New configuration</button><button disabled={busy || !editable || !selected} onClick={() => { setName(selected!.name); setDialog({ kind: 'rename', id: selected!.id }); }}>Rename configuration</button><button disabled={busy || !editable || !selected} onClick={() => setDialog({ kind: 'delete', id: selected!.id })}>Delete configuration</button></div>
    <div className="motor-layout"><aside className="configuration-info"><h2>Motors</h2><p>Select a configuration to edit its motor.</p></aside>
      <fieldset className="configuration-table"><legend>Motor configurations</legend><div className="table-scroll"><table><thead><tr><th>Configuration / motor</th><th>Archived default</th><th>Selection</th></tr></thead>
        <tbody>{document.flightConfigurations.map(c => <tr key={c.id} className={c.id === document.flightConfigurationId ? 'selected-row' : ''}>
          <td><button disabled={busy} aria-pressed={c.id === document.flightConfigurationId} onClick={() => select(c.id)} onDoubleClick={openSelector}>{c.label}</button></td><td>{c.isDefault ? 'Default' : '—'}</td><td>{c.id === document.flightConfigurationId ? 'Selected' : '—'}</td>
        </tr>)}</tbody></table>{!document.flightConfigurations.length && <p className="empty-state">No configurations. Choose New configuration to add a motor and simulation.</p>}</div>
        <div className="table-actions"><button disabled={busy || !document.flightConfigurations.length} onClick={openSelector}>Select motor</button></div>
      </fieldset>
    </div>
    {dialog && target && <WindowPanel title={dialog.kind === 'rename' ? 'Rename configuration' : 'Delete configuration'} close={() => setDialog(undefined)}>
      {dialog.kind === 'rename' ? <form onSubmit={async event => { event.preventDefault(); if (await rename(target.id, name)) setDialog(undefined); }}><label>Configuration name<input value={name} maxLength={256} required disabled={busy} onChange={event => setName(event.target.value)}/></label><div className="window-footer"><button type="button" onClick={() => setDialog(undefined)}>Cancel</button><button disabled={busy || !name.trim()}>Rename</button></div></form> : <><p>Delete “{target.name || target.label}” and its {document.simulations.filter(s => s.configurationId === target.id).length} linked simulation(s)?</p><div className="window-footer"><button onClick={() => setDialog(undefined)}>Cancel</button><button disabled={busy} onClick={async () => { if (await remove(target.id)) setDialog(undefined); }}>Delete</button></div></>}
    </WindowPanel>}
  </section>;
}
