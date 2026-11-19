import type { ComponentView } from './model';
import type { Drawing } from './drawing';
import {lengthLabel, type LengthUnit} from './units';
export function RocketDrawing({ drawing, components, selected, select, busy, unit }: {
  drawing: Drawing; components: ComponentView[]; selected: number; select: (index: number) => void; busy: boolean; unit: LengthUnit;
}) {
  const scale = Math.min(900 / (drawing.maxX - drawing.minX), 110 / Math.max(drawing.radius, 0.001));
  const x = (value: number) => 50 + (value - drawing.minX) * scale;
  const y = (value: number) => 150 - value * scale;
  return <section className="rocket-drawing" aria-label="Rocket drawing"><div className="drawing-title"><h2>Rocket side view</h2><span>Java geometry · {unit === 'm' ? 'metres' : 'inches'}</span></div>
    {drawing.error ? <p>{drawing.error}</p> : <>
      <svg viewBox="0 0 1000 300" role="img" aria-label="Rocket exterior side drawing: select a component to edit">
        <line x1="35" x2="965" y1="150" y2="150" stroke="#8298a6" strokeDasharray="5 5"/>
        {drawing.polygons.map((polygon, i) => {
          const index = drawing.componentIndices[polygon.index], component = components[index];
          return <polygon key={i} data-testid={`rocket-part-${component.id}`} points={polygon.points.map(([a,b]) => `${x(a)},${y(b)}`).join(' ')}
            fill={selected === index ? '#cce9fa' : component.type === 'trapezoidfinset' ? '#c4d0db' : '#f9fcff'}
            stroke={selected === index ? '#0072b2' : '#344e60'} strokeWidth={selected === index ? 3 : 1.5}
            tabIndex={busy ? -1 : 0} role="button" aria-label={`Select ${component.name} in drawing`} aria-pressed={selected === index}
            onClick={() => !busy && select(index)} onKeyDown={event => { if (!busy && ['Enter',' '].includes(event.key)) { event.preventDefault(); select(index); } }}>
            <title>{component.name} · {component.type}</title>
          </polygon>;
        })}
        <text x="50" y="280">Exterior extent: {lengthLabel(drawing.maxX-drawing.minX, unit)} · nose at left</text>
      </svg>
      <p className="drawing-selection">Selected: <strong>{components[selected]?.name}</strong>. Click the drawing or use the component tree to select a part.</p>
    </>}
    {!!drawing.omitted.length && <details><summary>Parts omitted from the exterior view ({drawing.omitted.length})</summary><ul>{drawing.omitted.map((text,i) => <li key={i}>{text}</li>)}</ul></details>}
  </section>;
}
