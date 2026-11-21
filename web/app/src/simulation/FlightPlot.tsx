import { useContext, useMemo, useRef, useState } from 'react';
import type { StoredPlot } from './saved';
import type { LengthUnit } from '../units';
import { WindowPanel } from '../WorkspacePanels';
import { PreferencesContext } from '../PreferencesContext';
import { channel, convertPlot, defaultEvents, eventX, extent, fitPlotAxes, plotColors, plotEvents, plotPoints, plotPresets, plotStyles, plotTypes, typeInfo, type Appearance, type PlotAxis, type PlotRow } from './plot';

export function FlightPlot({ plots, unit, name, source, close, defaults, setDefaults }: { plots: StoredPlot[]; unit: LengthUnit; name: string; source: string; close: () => void; defaults: Record<string, Appearance>; setDefaults: (defaults: Record<string, Appearance>) => void }) {
  const preferences = useContext(PreferencesContext), nextId = useRef(0), graph = useRef<SVGSVGElement>(null);
  function initialUnit(type: string) {
    const info = typeInfo(type), preferred = (preferences?.units as Record<string, string> | undefined)?.[info.preference];
    const choice = type === 'altitude' ? unit : preferred;
    return info.units.some(u => u.id === choice) ? choice! : info.defaultUnit;
  }
  function appearance(type: string, index: number): Appearance { return defaults[type] ?? { color: plotColors[index % plotColors.length], style: 'SOLID' }; }
  function makeRow(type: string, axis: PlotAxis, index: number): PlotRow {
    return { id: nextId.current++, type, axis, unit: initialUnit(type), ...appearance(type, index) };
  }
  const [preset, setPreset] = useState('0'), [x, setX] = useState('time'), [xUnit, setXUnit] = useState(initialUnit('time'));
  const [rows, setRows] = useState(() => plotPresets[0].y.map(([type, axis], i) => makeRow(type, axis, i)));
  const [events, setEvents] = useState(defaultEvents), [markerStyle, setMarkerStyle] = useState('line');
  const available = new Set(plots.flatMap(plot => Object.keys(plot.channels ?? { time: [], altitude: [] })));
  const types = [...plotTypes, ...[...available].filter(id => !plotTypes.some(t => t.id === id)).map(typeInfo)];
  const groups = [...new Set(types.map(t => t.group))];
  function typeOptions() {
    return groups.map(group => <optgroup key={group} label={group}>{types.filter(t => t.group === group).map(t => <option key={t.id} value={t.id} disabled={!available.has(t.id)}>{t.name}{available.has(t.id) ? '' : ' (no recorded data)'}</option>)}</optgroup>);
  }
  function unitOptions(type: string) { return typeInfo(type).units.map(u => <option key={u.id} value={u.id}>{u.id || '(dimensionless)'}</option>); }
  function update(id: number, change: Partial<PlotRow>) { setPreset('custom');setRows(rows.map(row => row.id === id ? { ...row, ...change } : row)); }
  function applyPreset(value: string) {
    setPreset(value);
    if (value === 'custom') return;
    const selected = plotPresets[Number(value)];
    setX(selected.x);setXUnit(initialUnit(selected.x));setRows(selected.y.map(([type, axis], i) => makeRow(type, axis, i)));
    setEvents(selected.events ?? defaultEvents);
  }
  const fitted = useMemo(() => fitPlotAxes(rows, plots), [rows, plots]);
  const series = rows.flatMap((row, index) => plots.map((plot, branch) => ({ row, index, branch, plot, points: plotPoints(plot, x, xUnit, row) })));
  const [minX, maxX] = extent(series.flatMap(s => s.points.flatMap(p => p ? [p[0]] : [])));
  const sx = (value: number) => 100 + (value - minX) / (maxX - minX) * 680;
  const sy = (value: number, index: number) => { const [min, max] = fitted.bounds[fitted.axes[index]];return 300 - (value - min) / (max - min) * 250; };
  const presentEvents = plotEvents.filter(e => plots.some(plot => plot.events?.some(event => event[0] === e.id)));
  const missing = rows.filter(row => !plots.some(plot => channel(plot, row.type).some(value => value != null)));
  const hasPoints = series.some(s => s.points.some(Boolean));
  const axisLabel = (axis: number) => rows.filter((_, i) => fitted.axes[i] === axis).map(row => `${typeInfo(row.type).name}${row.unit ? ` (${row.unit})` : ''}`).join(', ');
  const markers = plots.flatMap((plot, branch) => (plot.events ?? []).flatMap(([type, time], index) => {
    const value = eventX(plot, time, x);
    if (!events.includes(type) || value == null) return [];
    const position = sx(convertPlot(value, x, xUnit));
    if (position < 100 || position > 780) return [];
    return [{ key: `${branch}-${index}`, position, label: `${plot.name}: ${plotEvents.find(e => e.id === type)?.name ?? type} at ${time.toFixed(3)} s` }];
  }));
  return <WindowPanel title={`Flight graph · ${name}`} close={close} className="flight-graph">
    <h2>{name}</h2><p className="muted">{source}</p>
    <label className="plot-preset">Preset plot configurations:<select aria-label="Preset plot configurations" value={preset} onChange={event => applyPreset(event.target.value)}>{plotPresets.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}<option value="custom">Custom</option></select></label>
    <div className="plot-x"><label>X axis type:<select aria-label="X axis type" value={x} onChange={event => { setPreset('custom');setX(event.target.value);setXUnit(initialUnit(event.target.value)); }}>{typeOptions()}</select></label><label>Unit:<select aria-label="X axis unit" value={xUnit} onChange={event => { setPreset('custom');setXUnit(event.target.value); }}>{unitOptions(x)}</select></label></div>
    {x !== 'time' && <p className="muted">Data is plotted in time order even when the X axis is not time.</p>}
    <div className="plot-configuration">
      <section aria-label="Y axis types"><h3>Y axis types:</h3><div className="plot-rows">
        {rows.map((row, index) => <fieldset key={row.id} className="plot-row"><legend>Series {index + 1}</legend>
          <div className="plot-row-fields"><label>Type:<select aria-label={`Y axis type ${index + 1}`} value={row.type} onChange={event => { const type = event.target.value;update(row.id, { type, unit: initialUnit(type), ...appearance(type, index) }); }}>{typeOptions()}</select></label>
            <label>Unit:<select aria-label={index === 0 && row.type === 'altitude' ? 'Graph altitude units' : `Y axis unit ${index + 1}`} value={row.unit} onChange={event => update(row.id, { unit: event.target.value })}>{unitOptions(row.type)}</select></label>
            <label>Axis:<select aria-label={`Y axis side ${index + 1}`} value={row.axis} onChange={event => update(row.id, { axis: event.target.value as PlotAxis })}>{['Auto', 'Left', 'Right'].map(axis => <option key={axis}>{axis}</option>)}</select></label>
            <button aria-label={`Remove Y axis ${index + 1}`} disabled={rows.length === 1} onClick={() => { setPreset('custom');setRows(rows.filter(r => r.id !== row.id)); }}>Remove</button>
          </div>
          <div className="plot-row-fields plot-appearance"><label>Color:<input type="color" aria-label={`Series ${index + 1} color`} value={row.color} onChange={event => update(row.id, { color: event.target.value })}/></label>
            <label>Line style:<select aria-label={`Series ${index + 1} line style`} value={row.style} onChange={event => update(row.id, { style: event.target.value })}>{plotStyles.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}</select></label>
            <svg width="56" height="16" aria-hidden="true"><path d="M2 8H54" stroke={row.color} strokeWidth="3" strokeDasharray={plotStyles.find(s => s.id === row.style)?.dash || undefined}/></svg>
            <button title="Use this variable’s color and line style by default for this session" onClick={() => setDefaults({ ...defaults, [row.type]: { color: row.color, style: row.style } })}>Set as default</button>
            <button title="Restore the factory color and solid line for this series" onClick={() => update(row.id, { color: plotColors[index % plotColors.length], style: 'SOLID' })}>Reset</button>
          </div>
        </fieldset>)}
      </div><button disabled={rows.length >= 15 || !available.size} onClick={() => { setPreset('custom');setRows([...rows, makeRow(types.find(t => available.has(t.id) && !rows.some(row => row.type === t.id))?.id ?? x, 'Auto', rows.length)]); }}>New Y axis plot type</button>{rows.length >= 15 && <p className="muted">A maximum of 15 plots is allowed.</p>}</section>
      <fieldset className="plot-event-options"><legend>Flight events:</legend><div className="plot-event-list">{plotEvents.map(event => <label key={event.id}><input type="checkbox" disabled={!presentEvents.includes(event)} checked={events.includes(event.id)} onChange={e => { setPreset('custom');setEvents(e.target.checked ? [...events, event.id] : events.filter(t => t !== event.id)); }}/>{event.name}</label>)}</div>
        <div className="plot-event-buttons"><button onClick={() => { setPreset('custom');setEvents(plotEvents.map(e => e.id)); }}>All</button><button onClick={() => { setPreset('custom');setEvents([]); }}>None</button></div>
        <fieldset className="plot-marker-style"><legend>Marker style:</legend><label><input type="radio" name="plot-marker" checked={markerStyle === 'line'} onChange={() => setMarkerStyle('line')}/>Vertical line</label><label><input type="radio" name="plot-marker" checked={markerStyle === 'icon'} onChange={() => setMarkerStyle('icon')}/>Icon</label></fieldset>
      </fieldset>
    </div>
    {missing.length > 0 && <p role="status">No recorded data for {missing.map(row => typeInfo(row.type).name).join(', ')}.</p>}
    <div className="window-footer"><span>Appearance defaults apply for this session.</span><button onClick={close}>Close</button><button className="primary" disabled={!hasPoints} onClick={() => { graph.current?.scrollIntoView({ block: 'nearest' });graph.current?.focus({ preventScroll: true }); }}>Plot</button></div>
    {hasPoints ? <div className="plot-output"><svg ref={graph} tabIndex={-1} viewBox="0 0 880 385" role="img" aria-label={x === 'time' && rows[0]?.type === 'altitude' ? `Altitude versus time, ${rows[0].unit}, ${xUnit === 's' ? 'seconds' : xUnit}` : `${rows.map(row => typeInfo(row.type).name).join(', ')} versus ${typeInfo(x).name}`} className="flight-plot">
      <title>{name}</title><desc>{axisLabel(0)} on the left axis. {axisLabel(1)} on the right axis. Series and event descriptions follow the graph.</desc>
      <path d="M100 50V300H780V50" fill="none" stroke="currentColor"/>
      {[0, .25, .5, .75, 1].map(f => <g key={f}><path d={`M100 ${300 - f * 250}H780`} stroke="currentColor" opacity=".2" strokeDasharray="3 4"/>
        {[0, 1].map(axis => rows.some((_, i) => fitted.axes[i] === axis) && <text key={axis} x={axis ? 788 : 92} y={305 - f * 250} textAnchor={axis ? 'start' : 'end'}>{Number((fitted.bounds[axis][0] + f * (fitted.bounds[axis][1] - fitted.bounds[axis][0])).toPrecision(4))}</text>)}
        <text x={100 + f * 680} y="322" textAnchor="middle">{Number((minX + f * (maxX - minX)).toPrecision(4))}</text></g>)}
      {series.map(s => {
        const segments: [number, number][][] = [[]];
        for (const point of s.points) { if (point) segments.at(-1)!.push(point);else if (segments.at(-1)!.length) segments.push([]); }
        return segments.filter(segment => segment.length).map((segment, i) => <polyline key={`${s.row.id}-${s.branch}-${i}`} data-series={s.row.type} data-branch={s.branch} points={segment.map(([a, b]) => `${sx(a)},${sy(b, s.index)}`).join(' ')} fill="none" stroke={s.row.color} strokeWidth="2" strokeDasharray={plotStyles.find(style => style.id === s.row.style)?.dash || undefined}><title>{`${s.index + 1}. ${typeInfo(s.row.type).name} · ${s.plot.name} · ${fitted.axes[s.index] ? 'Right' : 'Left'} axis`}</title></polyline>);
      })}
      {markers.map((marker, i) => <g key={marker.key} className="plot-event-marker"><title>{marker.label}</title>{markerStyle === 'line' ? <path d={`M${marker.position} 50V300`} stroke="currentColor" opacity=".55" strokeDasharray="3 5"/> : <g><circle cx={marker.position} cy={60 + i % 3 * 18} r="8" fill="var(--control-bg)" stroke="currentColor"/><text x={marker.position} y={64 + i % 3 * 18} textAnchor="middle" fontSize="10">{i + 1}</text></g>}</g>)}
      <text x="100" y="26">Left axis</text>{rows.some((_, i) => fitted.axes[i] === 1) && <text x="780" y="26" textAnchor="end">Right axis</text>}
      <text x="440" y="357" textAnchor="middle">{typeInfo(x).name}{xUnit ? ` (${xUnit})` : ''}</text>
    </svg><ol className="plot-legend">{series.filter(s => s.points.some(Boolean)).map(s => <li key={`${s.row.id}-${s.branch}`}><svg width="36" height="14" aria-hidden="true"><path d="M0 7H36" stroke={s.row.color} strokeWidth="3" strokeDasharray={plotStyles.find(style => style.id === s.row.style)?.dash || undefined}/></svg>{typeInfo(s.row.type).name} ({s.row.unit || 'dimensionless'}) · {s.plot.name} · {fitted.axes[s.index] ? 'Right' : 'Left'} · {s.points.filter(Boolean).length} points</li>)}</ol>
      {markers.length > 0 && <details><summary>Flight event markers ({markers.length})</summary><ol>{markers.map(marker => <li key={marker.key}>{marker.label}</li>)}</ol></details>}
    </div> : <p>No stored flight series are available for these axes. Run the simulation or select recorded variables.</p>}
  </WindowPanel>;
}
