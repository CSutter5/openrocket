import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { motors } from './simulation/motor-catalog';
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
export function MotorSelector({ document, busy, select, close, assign }: { document: DocumentView; busy: boolean; select: (id: string) => void; close: () => void; assign: (configurationId: string, mountId: string, key: string, delay: string) => Promise<boolean> }) {
  const [search, setSearch] = useState(''), [choice, setChoice] = useState(document.flightConfigurationId);
  const [catalog, setCatalog] = useState(false), [manufacturer, setManufacturer] = useState(''), [page, setPage] = useState(0);
  const [motorKey, setMotorKey] = useState(''), [delay, setDelay] = useState('none'), [mount, setMount] = useState(document.motorMounts[0]?.id ?? '');
  const [target, setTarget] = useState(document.flightConfigurationId ?? ''), [rejected, setRejected] = useState(false);
  const motor = motors.find(m => m.key === motorKey);
  const filtered = motors.filter(m => (!manufacturer || m.manufacturer === manufacturer) && `${m.manufacturer} ${m.designation} ${m.commonName} ${m.caseInfo} ${m.diameter * 1000}`.toLowerCase().includes(search.toLowerCase()));
  const displayed = filtered.slice(page * 100, (page + 1) * 100);
  async function apply() {
    if (catalog) { const accepted = await assign(target, mount, motorKey, delay); setRejected(!accepted); if (accepted) close(); }
    else if (choice) select(choice);
  }
  const choices = document.flightConfigurations.filter(c => c.label.toLowerCase().includes(search.toLowerCase()));
  return <WindowPanel title="Select motor configuration" close={close} className="motor-selector">
    <div className="picker-tabs"><button aria-pressed={!catalog} onClick={() => { setCatalog(false); setSearch(''); }}>Archived configurations</button><button aria-pressed={catalog} onClick={() => { setCatalog(true); setSearch(''); setPage(0); }}>Motor catalog · {motors.length} curves</button></div>
    {catalog ? <>
      <div className="catalog-filters"><label>Search motors<input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }}/></label><label>Manufacturer<select aria-label="Manufacturer" value={manufacturer} onChange={event => { setManufacturer(event.target.value); setPage(0); }}><option value="">All manufacturers</option>{[...new Set(motors.map(m => m.manufacturer))].sort().map(name => <option key={name}>{name}</option>)}</select></label></div>
      <div className="table-scroll catalog-table"><table><thead><tr><th>Use</th><th>Manufacturer</th><th>Motor</th><th>Impulse (N·s)</th><th>Case</th><th>Diameter (mm)</th><th>Length (mm)</th></tr></thead><tbody>{displayed.map(m => <tr key={m.key} className={motorKey === m.key ? 'selected-row' : ''} onClick={() => { setMotorKey(m.key); setDelay(m.delays[0] ?? 'none'); setRejected(false); }}><td><input type="radio" name="catalog-motor" aria-label={`${m.manufacturer} ${m.designation} ${m.digest.slice(0, 8)}`} checked={motorKey === m.key} onChange={() => { setMotorKey(m.key); setDelay(m.delays[0] ?? 'none'); }}/></td><td>{m.manufacturer}</td><td>{m.designation}</td><td>{m.impulse.toFixed(2)}</td><td>{m.caseInfo || '—'}</td><td>{(m.diameter * 1000).toFixed(1)}</td><td>{(m.length * 1000).toFixed(1)}</td></tr>)}</tbody></table>{!filtered.length && <p className="empty-state">No matching motors.</p>}</div>
      <div className="catalog-pagination"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>{filtered.length ? `${page * 100 + 1}–${Math.min((page + 1) * 100, filtered.length)}` : '0'} of {filtered.length} curves · {motors.length} in bundled database</span><button disabled={(page + 1) * 100 >= filtered.length} onClick={() => setPage(page + 1)}>Next</button></div>
      <div className="catalog-assignment"><label>Assign to configuration<select aria-label="Assign to configuration" value={target} disabled={busy} onChange={event => setTarget(event.target.value)}>{document.flightConfigurations.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label><label>Motor mount<select aria-label="Motor mount" value={mount} disabled={busy} onChange={event => setMount(event.target.value)}>{document.motorMounts.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>Ejection delay (seconds or none)<input value={delay} list="catalog-delays" disabled={busy} onChange={event => setDelay(event.target.value)}/><datalist id="catalog-delays">{[...new Set([...(motor?.delays ?? []), 'none'])].map(d => <option key={d} value={d}/>)}</datalist></label></div>
      <p>{motor ? `${motor.manufacturer} ${motor.designation} · ${motor.type} · ${motor.burnTime.toFixed(2)} s burn · curve ${motor.digest}` : 'Choose a motor curve. All bundled motor and curve options are listed, including multiple curves for the same motor.'}</p>
      <p className="muted">OK changes this configuration’s motor and embeds the verified thrust curve in the .ork download. Existing simulations using that configuration become outdated.</p>
      {(!document.motorMounts.length || !document.flightConfigurations.length) && <p className="error">Open a rocket with an existing motor mount and configuration to assign a motor.</p>}
      {rejected && <p role="alert" className="error">Motor assignment was rejected. The accepted document is retained; see the error above the workspace.</p>}
    </> : <div className="selector-layout"><section><h2>Archived motors</h2><p>Choose the motor configuration for this session's flights.</p>
      <label className="search-field">Search motors<input value={search} onChange={event => setSearch(event.target.value)} type="search"/></label>
      <div className="table-scroll"><table><thead><tr><th>Use</th><th>Configuration / motor / ejection delay</th></tr></thead><tbody>{choices.map(c => <tr key={c.id} className={choice === c.id ? 'selected-row' : ''}>
        <td><input id={`motor-${c.id}`} type="radio" name="motor-choice" aria-label={c.label} checked={choice === c.id} onChange={() => setChoice(c.id)}/></td><td><label htmlFor={`motor-${c.id}`}>{c.label}{c.isDefault ? ' · archived default' : ''}</label></td>
      </tr>)}</tbody></table>{!choices.length && <p className="empty-state">No matching configurations.</p>}</div><p className="muted">{choices.length} of {document.flightConfigurations.length} archived configurations</p>
    </section><aside><h3>Motor selection</h3><p>{document.flightConfigurations.find(c => c.id === choice)?.label ?? 'Choose a configuration.'}</p><h3>Available in this editor</h3><p>Select existing archived motors and delays. Use the Motor catalog tab to choose another curve and save it to a configuration.</p><p className="muted">Selection does not change the archived default or .ork download. Flight support is checked for the selected configuration.</p></aside></div>}
    <div className="window-footer"><button onClick={close}>Cancel</button><button className="primary" disabled={busy || (catalog ? !motor || !target || !mount : !choice)} onClick={apply}>OK</button></div>
  </WindowPanel>;
}
