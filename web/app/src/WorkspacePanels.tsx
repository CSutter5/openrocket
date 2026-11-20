import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { DocumentView } from './model';

const icons = import.meta.glob('../../../swing/src/main/resources/pix/componenticons/*-large.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const iconNames: Record<string, string> = { rocket: 'stage', trapezoidfinset: 'trapezoidfin', masscomponent: 'mass_dark', shockcord: 'shockcord_dark', parachute: 'parachute_dark', streamer: 'streamer_dark', podset: 'pods_dark', parallelstage: 'boosters' };
export function ComponentIcon({ type }: { type: string }) {
  const name = iconNames[type] ?? type;
  const src = icons[`../../../swing/src/main/resources/pix/componenticons/${name}-large.png`];
  return src ? <img className="component-icon" src={src} alt=""/> : <span className="component-icon unknown-icon" aria-hidden="true">◇</span>;
}
const groups = [
  { name: 'Assembly components', parts: [['stage', 'Stage'], ['boosters', 'Boosters'], ['podset', 'Pods']] },
  { name: 'Body components and fin sets', parts: [['nosecone', 'Nose cone'], ['bodytube', 'Body tube'], ['transition', 'Transition'], ['trapezoidfinset', 'Trapezoidal'], ['ellipticalfin_dark', 'Elliptical'], ['freeformfin_dark', 'Freeform'], ['tubefin', 'Tube fins'], ['railbutton', 'Rail button'], ['launchlug_dark', 'Launch lug']] },
  { name: 'Inner components', parts: [['innertube', 'Inner tube'], ['tubecoupler', 'Tube coupler'], ['centeringring', 'Centering ring'], ['bulkhead', 'Bulkhead'], ['engineblock', 'Engine block']] },
  { name: 'Mass components', parts: [['parachute', 'Parachute'], ['streamer', 'Streamer'], ['shockcord', 'Shock cord'], ['masscomponent', 'Mass component']] },
];
export function ComponentPalette() {
  return <section className="component-palette" aria-label="Add new component"><h2>Add new component</h2>
    {groups.map(group => <div className="palette-group" key={group.name}><h3>{group.name}</h3><div className="palette-items">{group.parts.map(([type, label]) => <button key={type} disabled title="Adding components is not supported in the web editor yet"><ComponentIcon type={type}/><span>{label}</span></button>)}</div></div>)}
    <p className="muted palette-note">Component creation is not available yet. Select an existing component and choose Edit.</p>
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
export function MotorConfigurations({ document, busy, select, openSelector }: { document: DocumentView; busy: boolean; select: (id: string) => void; openSelector: () => void }) {
  return <section className="motor-panel" aria-label="Motor configurations">
    <div className="panel-toolbar"><button disabled title="Creating configurations is not supported yet">New configuration</button><button disabled title="Renaming configurations is not supported yet">Rename configuration</button><button disabled title="Deleting configurations is not supported yet">Delete configuration</button></div>
    <div className="motor-layout"><aside className="configuration-info"><h2>Motors</h2><p>Select an archived configuration for this session.</p><p className="muted">The archived default and motor assignments are preserved.</p></aside>
      <fieldset className="configuration-table"><legend>Motor configurations</legend><div className="table-scroll"><table><thead><tr><th>Configuration / motor</th><th>Archived default</th><th>Session selection</th></tr></thead>
        <tbody>{document.flightConfigurations.map(c => <tr key={c.id} className={c.id === document.flightConfigurationId ? 'selected-row' : ''}>
          <td><button disabled={busy} aria-pressed={c.id === document.flightConfigurationId} onClick={() => select(c.id)} onDoubleClick={openSelector}>{c.label}</button></td><td>{c.isDefault ? 'Default' : '—'}</td><td>{c.id === document.flightConfigurationId ? 'Selected' : '—'}</td>
        </tr>)}</tbody></table>{!document.flightConfigurations.length && <p className="empty-state">No motor configurations in this archive. Open a configured rocket or the flight-ready sample from File.</p>}</div>
        <div className="table-actions"><button disabled={busy || !document.flightConfigurations.length} onClick={openSelector}>Select motor</button></div>
      </fieldset>
    </div>
  </section>;
}
export function MotorSelector({ document, busy, select, close }: { document: DocumentView; busy: boolean; select: (id: string) => void; close: () => void }) {
  const [search, setSearch] = useState(''), [choice, setChoice] = useState(document.flightConfigurationId);
  const choices = document.flightConfigurations.filter(c => c.label.toLowerCase().includes(search.toLowerCase()));
  return <WindowPanel title="Select motor configuration" close={close} className="motor-selector">
    <div className="selector-layout"><section><h2>Archived motors</h2><p>Choose the motor configuration for this session's flights.</p>
      <label className="search-field">Search motors<input value={search} onChange={event => setSearch(event.target.value)} type="search"/></label>
      <div className="table-scroll"><table><thead><tr><th>Use</th><th>Configuration / motor / ejection delay</th></tr></thead><tbody>{choices.map(c => <tr key={c.id} className={choice === c.id ? 'selected-row' : ''}>
        <td><input id={`motor-${c.id}`} type="radio" name="motor-choice" aria-label={c.label} checked={choice === c.id} onChange={() => setChoice(c.id)}/></td><td><label htmlFor={`motor-${c.id}`}>{c.label}{c.isDefault ? ' · archived default' : ''}</label></td>
      </tr>)}</tbody></table>{!choices.length && <p className="empty-state">No matching configurations.</p>}</div><p className="muted">{choices.length} of {document.flightConfigurations.length} archived configurations</p>
    </section><aside><h3>Motor selection</h3><p>{document.flightConfigurations.find(c => c.id === choice)?.label ?? 'Choose a configuration.'}</p><h3>Available in this editor</h3><p>Select existing archived motors and delays. A full motor catalog and changes to motor assignments are not available yet.</p><p className="muted">Selection does not change the archived default or .ork download. Flight support is checked for the selected configuration.</p></aside></div>
    <div className="window-footer"><button onClick={close}>Cancel</button><button className="primary" disabled={busy || !choice} onClick={() => choice && select(choice)}>OK</button></div>
  </WindowPanel>;
}
