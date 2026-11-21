import type { StoredPlot } from './saved';
import { displayLength, lengthUnits, type LengthUnit } from '../units';
import { WindowPanel } from '../WorkspacePanels';
export function FlightPlot({ plots, unit, setUnit, name, source, close }: { plots: StoredPlot[]; unit: LengthUnit; setUnit: (unit: LengthUnit) => void; name: string; source: string; close: () => void }) {
  const rows = plots.flatMap(p => p.points);
  const time = rows.reduce((max, p) => Math.max(max, p[0]), 1), min = rows.reduce((min, p) => Math.min(min, p[1]), 0), max = rows.reduce((max, p) => Math.max(max, p[1]), 1), range = max - min;
  const colors = ['var(--plot-series-1)', 'var(--plot-series-2)', 'var(--plot-series-3)', 'var(--plot-series-4)'];
  return <WindowPanel title={`Flight graph · ${name}`} close={close} className="flight-graph">
    <h2>{name}</h2><label>Graph altitude units<select aria-label="Graph altitude units" value={unit} onChange={event => setUnit(event.target.value as LengthUnit)}>{lengthUnits.map(u => <option key={u.id} value={u.id}>{u.label} ({u.id})</option>)}</select></label><p className="muted">{source}</p>{rows.length ? <svg viewBox="0 0 800 360" role="img" aria-label={`Altitude versus time, ${unit}, seconds`} className="flight-plot">
      <path d="M65 35V295H765" fill="none" stroke="currentColor"/>
      {[0, .25, .5, .75, 1].map(f => <g key={f}><path d={`M65 ${295 - f * 250}H765`} stroke="#47505f" strokeDasharray="3 4"/><text x="3" y={300 - f * 250}>{Number(displayLength(min + f * range, unit).toPrecision(4))}</text><text x={65 + f * 700} y="318">{(f * time).toFixed(1)}</text></g>)}
      {plots.map((plot, i) => <polyline key={i} points={plot.points.map(([t, h]) => `${65 + t / time * 700},${295 - (h - min) / range * 250}`).join(' ')} fill="none" stroke={colors[i % colors.length]} strokeDasharray={i ? `${8 + i} 4` : undefined} strokeWidth="2"><title>{plot.name}</title></polyline>)}
      <text x="65" y="20">Altitude ({unit})</text><text x="360" y="350">Time (s)</text>
    </svg> : <p>No stored flight series are available for this simulation. Run it to create a graph.</p>}
    <ul>{plots.map((plot, i) => <li key={i}>{plot.name} · {i ? `dashed line ${i + 1}` : 'solid line'} · {plot.points.length} points</li>)}</ul>
    <div className="window-footer"><button onClick={close}>Close</button></div>
  </WindowPanel>;
}
