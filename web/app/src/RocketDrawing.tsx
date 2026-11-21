import { useEffect, useRef, useState } from 'react';
import type { ComponentView, DocumentView } from './model';
import type { Drawing } from './drawing';
import {displayLength, lengthLabel, type LengthUnit} from './units';
export function RocketDrawing({ drawing, stability, components, selected, select, busy, unit, edit }: {
  drawing: Drawing; stability: DocumentView['stability']; components: ComponentView[]; selected: number; select: (index: number) => void; busy: boolean; unit: LengthUnit; edit: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const canvas = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(300);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const resize = () => {
      const box = element.getBoundingClientRect();
      if (box.width) setHeight(Math.max(80, 1000 * box.height / box.width));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element); resize();
    return () => observer.disconnect();
  }, [drawing.error]);
  const scale = Math.min(900 / (drawing.maxX - drawing.minX), (height - 36) / 2 / Math.max(drawing.radius, 0.001));
  const x = (value: number) => 50 + (value - drawing.minX) * scale;
  const y = (value: number) => 150 - value * scale;
  return <section className="rocket-drawing" aria-label="Rocket drawing"><div className="drawing-title"><div><h2>Rocket side view</h2><span>Exterior extent: {lengthLabel(drawing.maxX - drawing.minX, unit)}</span></div><div className="zoom-controls"><button aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom(Math.max(.5, zoom - .25))}>−</button><button onClick={() => setZoom(1)}>{Math.round(zoom * 100)}% · Fit</button><button aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(Math.min(3, zoom + .25))}>+</button></div></div>
    {drawing.error ? <p>{drawing.error}</p> : <>
      <div ref={canvas} className="drawing-canvas"><svg style={{ width: `${zoom * 100}%`, minWidth: `${zoom * 100}%`, height: `${zoom * 100}%` }} viewBox={`0 0 1000 ${height}`} role="img" aria-label="Rocket exterior side drawing: select a component to edit">
        <defs><pattern id="ruler-ticks" width="20" height="12" patternUnits="userSpaceOnUse"><path d="M0 0V10M10 0V5" stroke="currentColor" strokeWidth=".5"/></pattern></defs>
        <rect x="35" y="0" width="930" height="12" fill="url(#ruler-ticks)"/>
        {Array.from({ length: 10 }, (_, i) => <text key={i} className="ruler-number" x={50 + i * 100} y="24">{Number((displayLength(i * 100 / scale, unit)).toPrecision(3))}</text>)}
        <g transform={`translate(0 ${(height + 20) / 2 - 150})`}><line x1="35" x2="965" y1="150" y2="150" stroke="#8298a6" strokeDasharray="5 5"/>
        {drawing.polygons.map((polygon, i) => {
          const index = drawing.componentIndices[polygon.index], component = components[index];
          return <polygon key={i} data-testid={`rocket-part-${component.id}`} points={polygon.points.map(([a,b]) => `${x(a)},${y(b)}`).join(' ')}
            fill={selected === index ? 'var(--drawing-selected)' : 'var(--drawing-fill)'}
            stroke={selected === index ? 'var(--drawing-selected-stroke)' : 'var(--drawing-stroke)'} strokeWidth={selected === index ? 3 : 1.5}
            tabIndex={busy ? -1 : 0} role="button" aria-label={`Select ${component.name} in drawing`} aria-pressed={selected === index}
            onClick={() => !busy && select(index)} onDoubleClick={() => !busy && edit()} onKeyDown={event => { if (!busy && ['Enter',' '].includes(event.key)) { event.preventDefault(); select(index); } }}>
            <title>{component.name} · {component.type}</title>
          </polygon>;
        })}
        {([['cg', stability.cg, '#56b4e9'], ['cp', stability.cp, '#e69f00']] as const).map(([kind, value, color]) => value != null && Number.isFinite(value) && <g key={kind} data-testid={`rocket-${kind}`} data-position={value} transform={`translate(${x(value)} 150) scale(0.75)`} pointerEvents="none" aria-label={`${kind === 'cg' ? 'Center of gravity' : 'Center of pressure'}: ${lengthLabel(value, unit)}`}>
          <circle r="9" fill="#171a20" stroke={color} strokeWidth="2"/>
          {kind === 'cg' ? <path d="M-9 0H9M0-9V9M0 0H9A9 9 0 0 0 0-9ZM0 0H-9A9 9 0 0 0 0 9Z" fill={color} stroke={color}/> : <><circle r="3" fill={color}/><path d="M-13 0H-9M9 0H13M0-13V-9M0 9V13" stroke={color} strokeWidth="2"/></>}
        </g>)}
        </g>
      </svg></div>
      <p className="stability-values" aria-label="Rocket stability">CG: <strong>{stability.cg == null ? 'Unavailable' : lengthLabel(stability.cg, unit)}</strong> · CP: <strong>{stability.cp == null ? 'Unavailable' : lengthLabel(stability.cp, unit)}</strong> · From rocket origin · Launch mass, selected configuration · CP at Mach 0.3, 0° angle of attack{stability.reason && <span className="muted"> · {stability.reason}</span>}</p>
      <p className="drawing-selection">Selected: <strong>{components[selected]?.name}</strong>. Click to select · Double-click to edit · Enter / Space to select with keyboard.</p>
    </>}
    {!!drawing.omitted.length && <details><summary>Parts omitted from the exterior view ({drawing.omitted.length})</summary><ul>{drawing.omitted.map((text,i) => <li key={i}>{text}</li>)}</ul></details>}
  </section>;
}
