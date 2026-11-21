import { useContext, useState } from 'react';
import type { DocumentView } from './model';
import { WindowPanel } from './WorkspacePanels';
import { motors } from './simulation/motor-catalog';
import { defaultFilters, diameters, filterMotors, impulseClasses, mountDiameterStop, type MotorFilters } from './simulation/motor-filters';
import { PreferencesContext } from './PreferencesContext';
import { preferredUnit } from './preferences';
export function MotorSelector({ document, busy, close, assign, creating }: { document: DocumentView; busy: boolean; creating: boolean; close: () => void; assign: (mountId: string, key: string, delay: string, name?: string) => Promise<boolean> }) {
  const preferences = useContext(PreferencesContext), dimension = preferredUnit(preferences, 'MOTOR_DIMENSIONS', 'mm'), impulse = preferredUnit(preferences, 'IMPULSE', 'Ns');
  const size = (metres: number) => (metres / dimension.factor).toFixed(dimension.id === 'mm' ? 1 : dimension.id === 'm' ? 4 : 3);
  const filterLength = (value: string) => value === '' ? '' : String(Number((Number(value) / 1000 / dimension.factor).toPrecision(12)));
  const canonicalLength = (value: string) => value === '' ? '' : String(Number(value) * dimension.factor * 1000);
  const firstMount = document.motorMounts[0];
  const existing = firstMount?.assignments.find(a => a.configurationId === document.flightConfigurationId);
  const names = new Set(document.flightConfigurations.map(c => c.name));let next = 1;while (names.has(`Configuration ${next}`)) next++;
  const [name, setName] = useState(`Configuration ${next}`), [mountId, setMount] = useState(firstMount?.id ?? '');
  const [motorKey, setMotorKey] = useState(creating ? '' : existing?.motorKey ?? ''), [delay, setDelay] = useState(creating ? 'none' : existing?.delay ?? 'none');
  const [filters, setFilters] = useState<MotorFilters>(defaultFilters), [page, setPage] = useState(0), [common, setCommon] = useState(true), [rejected, setRejected] = useState(false);
  const mount = document.motorMounts.find(m => m.id === mountId), motor = motors.find(m => m.key === motorKey);
  const filtered = filterMotors(motors, filters, mount, motor), currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 100) - 1));
  const displayed = filtered.slice(currentPage * 100, (currentPage + 1) * 100);
  const manufacturers = [...new Set(motors.map(m => m.manufacturer))].sort();
  const update = (change: Partial<MotorFilters>) => { setFilters(previous => ({ ...previous, ...change }));setPage(0); };
  const diameterLabel = (value: number) => value === 11 ? 'Any' : `${size(diameters[value])} ${dimension.id}`;
  const choose = (key: string) => { const m = motors.find(m => m.key === key)!;setMotorKey(key);setDelay(m.delays[0] ?? 'none');setRejected(false); };
  async function apply() { const accepted = await assign(mountId, motorKey, delay, creating ? name : undefined);setRejected(!accepted);if (accepted) close(); }
  return <WindowPanel title={creating ? 'New configuration' : 'Select motor'} close={close} className="motor-selector">
    {creating && <label className="configuration-name">Configuration name<input value={name} required maxLength={256} disabled={busy} onChange={event => setName(event.target.value)}/></label>}
    <div className="motor-picker-layout"><section className="motor-picker-main">
      <label className="search-field">Search motors<input type="search" value={filters.search} onChange={event => update({ search: event.target.value })}/></label>
      <label className="check-row"><input type="checkbox" checked={filters.hideSimilar} onChange={event => update({ hideSimilar: event.target.checked })}/>Hide very similar thrust curves</label>
      <label className="check-row"><input type="checkbox" checked={filters.hideUnavailable} onChange={event => update({ hideUnavailable: event.target.checked })}/>Hide motors which are not in regular production</label>
      <div className="name-column"><span>Motor name column:</span><label><input type="radio" name="name-column" checked={common} onChange={() => setCommon(true)}/>Use common name</label><label><input type="radio" name="name-column" checked={!common} onChange={() => setCommon(false)}/>Use manufacturer's designation</label></div>
      <div className="table-scroll catalog-table"><table><thead><tr><th>Use</th><th>Manufacturer</th><th>Motor</th><th>Impulse ({preferences ? impulse.id : 'N·s'})</th><th>Case</th><th>Diameter ({dimension.id})</th><th>Length ({dimension.id})</th></tr></thead><tbody>{displayed.map(m => <tr key={m.key} className={motorKey === m.key ? 'selected-row' : ''} onClick={() => choose(m.key)}><td><input type="radio" name="catalog-motor" aria-label={`${m.manufacturer} ${m.designation} ${m.digest.slice(0, 8)}`} checked={motorKey === m.key} onChange={() => choose(m.key)}/></td><td>{m.manufacturer}</td><td>{common ? m.commonName : m.designation}</td><td>{(m.impulse / impulse.factor).toFixed(2)}</td><td>{m.caseInfo || '—'}</td><td>{size(m.diameter)}</td><td>{size(m.length)}</td></tr>)}</tbody></table>{!filtered.length && <p className="empty-state">No matching motors.</p>}</div>
      <div className="catalog-pagination"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{filtered.length ? `${currentPage * 100 + 1}–${Math.min((currentPage + 1) * 100, filtered.length)}` : '0'} of {filtered.length} curves · {motors.length} in catalog</span><button disabled={(currentPage + 1) * 100 >= filtered.length} onClick={() => setPage(currentPage + 1)}>Next</button></div>
      <div className="catalog-assignment"><label>Motor mount<select aria-label="Motor mount" value={mountId} disabled={busy} onChange={event => { setMount(event.target.value);setPage(0); }}>{document.motorMounts.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>Ejection delay (seconds or none)<input value={delay} list="catalog-delays" disabled={busy} onChange={event => setDelay(event.target.value)}/><datalist id="catalog-delays">{[...new Set([...(motor?.delays ?? []), 'none'])].map(d => <option key={d} value={d}/>)}</datalist></label></div>
      {motor && <p>{motor.manufacturer} {motor.designation} · {size(motor.diameter)} × {size(motor.length)} {dimension.id}</p>}
    </section><aside className="motor-picker-filters">
      <label className="check-row"><input type="checkbox" checked={filters.hideUsed} onChange={event => update({ hideUsed: event.target.checked })}/>Hide motors already used in the mount</label>
      <fieldset><legend>Manufacturer</legend><div className="manufacturer-list">{manufacturers.map(m => <label key={m} className="check-row"><input type="checkbox" aria-label={m} checked={filters.manufacturers === null || filters.manufacturers.includes(m)} onChange={event => update({ manufacturers: event.target.checked ? [...(filters.manufacturers ?? manufacturers), m] : (filters.manufacturers ?? manufacturers).filter(name => name !== m) })}/>{m}</label>)}</div><div className="manufacturer-actions"><button onClick={() => update({ manufacturers: [] })}>Clear all</button><button onClick={() => update({ manufacturers: null })}>Select all</button></div></fieldset>
      <fieldset><legend>Total impulse</legend><div className="range-caption">{impulseClasses[filters.minImpulse]} – {impulseClasses[filters.maxImpulse]}</div><label>Minimum impulse class<input aria-valuetext={impulseClasses[filters.minImpulse]} type="range" min={0} max={14} value={filters.minImpulse} onChange={event => update({ minImpulse: Number(event.target.value), maxImpulse: Math.max(filters.maxImpulse, Number(event.target.value)) })}/></label><label>Maximum impulse class<input aria-valuetext={impulseClasses[filters.maxImpulse]} type="range" min={0} max={14} value={filters.maxImpulse} onChange={event => update({ maxImpulse: Number(event.target.value), minImpulse: Math.min(filters.minImpulse, Number(event.target.value)) })}/></label></fieldset>
      <fieldset><legend>Motor dimensions</legend><p className="muted">Mount: {mount?.diameter !== undefined && mount.length !== undefined ? `${size(mount.diameter)} × ${size(mount.length)} ${dimension.id}` : 'dimensions unavailable'}</p>
        <label className="check-row"><input type="checkbox" disabled={mount?.diameter === undefined} checked={filters.fitDiameter} onChange={event => update({ fitDiameter: event.target.checked })}/>Limit motor diameter to mount diameter</label>
        <div className="range-caption">{diameterLabel(filters.minDiameter)} – {diameterLabel(filters.fitDiameter && mount?.diameter !== undefined ? mountDiameterStop(mount.diameter) : filters.maxDiameter)}</div>
        <label>Minimum nominal diameter<input type="range" min={0} max={11} disabled={filters.fitDiameter} value={filters.minDiameter} aria-valuetext={diameterLabel(filters.minDiameter)} onChange={event => update({ minDiameter: Number(event.target.value), maxDiameter: Math.max(filters.maxDiameter, Number(event.target.value)) })}/></label>
        <label>Maximum nominal diameter<input type="range" min={0} max={11} disabled={filters.fitDiameter} value={filters.maxDiameter} aria-valuetext={diameterLabel(filters.maxDiameter)} onChange={event => update({ maxDiameter: Number(event.target.value), minDiameter: Math.min(filters.minDiameter, Number(event.target.value)) })}/></label>
        <label className="check-row"><input type="checkbox" disabled={mount?.length === undefined} checked={filters.fitLength} onChange={event => update({ fitLength: event.target.checked })}/>Limit motor length to mount length</label>
        <div className="length-range"><label>Minimum length ({dimension.id})<input type="number" min={0} value={filterLength(filters.minLength)} onChange={event => update({ minLength: canonicalLength(event.target.value) })}/></label><label>Maximum length ({dimension.id})<input type="number" min={0} placeholder="No limit" disabled={filters.fitLength} value={filters.fitLength && mount?.length !== undefined ? size(mount.length) : filterLength(filters.maxLength)} onChange={event => update({ maxLength: canonicalLength(event.target.value) })}/></label></div>
      </fieldset>
    </aside></div>
    {!document.motorMounts.length && <p className="error">This rocket has no motor mount.</p>}
    {rejected && <p role="alert" className="error">The motor change was rejected. Your document was retained; see the error above the workspace.</p>}
    <div className="window-footer"><button onClick={close}>Cancel</button><button className="primary" disabled={busy || !motor || !mount || !filtered.some(m => m.key === motorKey) || creating && !name.trim()} onClick={apply}>{creating ? 'Create configuration' : 'OK'}</button></div>
  </WindowPanel>;
}
